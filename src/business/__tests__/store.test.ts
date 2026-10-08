import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';
import { useBusinessStore } from '../store/businessStore';
import { useBusinessModeStore } from '../store/modeStore';
import { notifyRejected } from '../store/notices';
import { recurringExpenseId } from '../logic/recurring';
import { readBizMark } from '../cloud/sync';
import { Order, OrderLine } from '../types';

// Firestore falsa en memoria, que hace de servidor (como la de cloudLoading):
// guarda lo escrito con la hora del servidor, entiende los campos con punto
// (entries.close), set con merge (junta los mapas), arrayUnion/arrayRemove,
// where (==, >=, array-contains), orderBy y limit, y avisa a las escuchas.
// rules hace de reglas: devuelve false para rechazar una escritura. Con
// offline, lo escrito espera en una cola (como la de Firestore) hasta
// goOnline, lo que se pide al servidor falla y lo leído viene «de la caché»
type MockData = Record<string, unknown>;
type MockOp = { path: string; id: string; kind: 'set' | 'update' | 'delete'; data?: MockData; merge?: boolean };
type MockFilter = { field: string; op: string; value: unknown };
const mockDb = {
  docs: {} as Record<string, Record<string, MockData>>,
  clock: 0,
  listeners: [] as { run: () => void }[],
  rules: null as null | ((op: MockOp, docs: Record<string, Record<string, MockData>>) => boolean),
  autoId: 0,
  offline: false,
  queue: [] as { ops: MockOp[]; resolve: () => void; reject: (e: unknown) => void }[],
  waiters: [] as (() => void)[],
  // Vuelve la conexión: sube la cola en orden (las reglas pueden rechazar algo)
  goOnline: async () => {
    mockDb.offline = false;
    const { apply } = jest.requireMock('@react-native-firebase/firestore').default as { apply: (ops: MockOp[]) => Promise<void> };
    for (const item of mockDb.queue.splice(0)) await apply(item.ops).then(item.resolve, item.reject);
    mockDb.waiters.splice(0).forEach((done) => done());
  },
};
const mockAuth = { uid: 'u1' };
const mockNotices: string[] = [];

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('@react-native-firebase/firestore', () => {
  class Timestamp {
    ms: number;
    constructor(at: number) { this.ms = at; }
    toMillis() { return this.ms; }
    static fromMillis(at: number) { return new Timestamp(at); }
  }
  const SERVER_TIME = { serverTime: true };
  const DELETE_FIELD = { deleteField: true };
  class ArrayOp {
    kind: 'union' | 'remove';
    items: unknown[];
    constructor(kind: 'union' | 'remove', items: unknown[]) { this.kind = kind; this.items = items; }
  }
  const FieldValue = {
    serverTimestamp: () => SERVER_TIME,
    delete: () => DELETE_FIELD,
    arrayUnion: (...items: unknown[]) => new ArrayOp('union', items),
    arrayRemove: (...items: unknown[]) => new ArrayOp('remove', items),
  };
  const isPlain = (v: unknown): v is MockData => v != null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
  const value = (prev: unknown, v: unknown, at: number): unknown => {
    if (v === SERVER_TIME) return new Timestamp(at);
    if (v instanceof ArrayOp) {
      const list = Array.isArray(prev) ? [...prev] : [];
      return v.kind === 'union'
        ? [...list, ...v.items.filter((i) => !list.includes(i))]
        : list.filter((i) => !v.items.includes(i));
    }
    if (isPlain(v)) {
      const out: MockData = {};
      for (const [k, x] of Object.entries(v)) if (x !== DELETE_FIELD) out[k] = value(undefined, x, at);
      return out;
    }
    return v;
  };
  // set con merge: junta los mapas por dentro
  const merge = (prev: MockData, data: MockData, at: number): MockData => {
    const out: MockData = { ...prev };
    for (const [k, v] of Object.entries(data)) {
      if (v === DELETE_FIELD) delete out[k];
      else if (isPlain(v) && isPlain(out[k])) out[k] = merge(out[k] as MockData, v, at);
      else out[k] = value(out[k], v, at);
    }
    return out;
  };
  // update: los campos con punto cambian solo ese campo, entero
  const update = (prev: MockData, data: MockData, at: number): MockData => {
    const out: MockData = JSON.parse(JSON.stringify(prev), (_k, v) => v);
    // Las horas no sobreviven a JSON: se copian aparte
    for (const [k, v] of Object.entries(prev)) if (v instanceof Timestamp) out[k] = v;
    for (const [path, v] of Object.entries(data)) {
      const keys = path.split('.');
      let target = out;
      for (const k of keys.slice(0, -1)) {
        if (!isPlain(target[k])) target[k] = {};
        target = target[k] as MockData;
      }
      const last = keys[keys.length - 1];
      if (v === DELETE_FIELD) delete target[last];
      else target[last] = value(target[last], v, at);
    }
    return out;
  };
  const apply = async (ops: MockOp[]) => {
    if (mockDb.rules && ops.some((op) => !mockDb.rules!(op, mockDb.docs))) {
      throw Object.assign(new Error('denied'), { code: 'firestore/permission-denied' });
    }
    if (ops.some((op) => op.kind === 'update' && !mockDb.docs[op.path]?.[op.id])) {
      throw Object.assign(new Error('not found'), { code: 'firestore/not-found' });
    }
    mockDb.clock += 60 * 1000;
    for (const op of ops) {
      const col = (mockDb.docs[op.path] ??= {});
      if (op.kind === 'delete') delete col[op.id];
      else if (op.kind === 'update') col[op.id] = update(col[op.id], op.data!, mockDb.clock);
      else col[op.id] = op.merge && col[op.id] ? merge(col[op.id], op.data!, mockDb.clock) : (value(undefined, op.data!, mockDb.clock) as MockData);
    }
    mockDb.listeners.forEach((l) => l.run());
  };
  const commit = (ops: MockOp[]): Promise<void> => (mockDb.offline
    ? new Promise((resolve, reject) => { mockDb.queue.push({ ops, resolve, reject }); })
    : apply(ops));
  const unavailable = () => Object.assign(new Error('offline'), { code: 'firestore/unavailable' });
  const matches = (data: MockData, { field, op, value: v }: MockFilter) => {
    const x = data[field];
    if (op === '==') return x === v;
    if (op === 'array-contains') return Array.isArray(x) && x.includes(v);
    if (v instanceof Timestamp) return x instanceof Timestamp && x.ms >= v.ms;
    return typeof x === 'string' && x >= (v as string);
  };
  const snapOf = (path: string, id: string) => {
    const data = mockDb.docs[path]?.[id];
    return { id, exists: () => !!data, data: () => (data ? { ...data } : undefined), metadata: { fromCache: mockDb.offline }, ref: docRef(path, id) };
  };
  const docRef = (path: string, id?: string): unknown => {
    const docId = id ?? `auto${++mockDb.autoId}`;
    return {
      id: docId,
      path: `${path}/${docId}`,
      collection: (name: string) => query(`${path}/${docId}/${name}`),
      get: async (opts?: { source?: string }) => {
        if (mockDb.offline && opts?.source === 'server') throw unavailable();
        return snapOf(path, docId);
      },
      set: (data: MockData, opts?: { merge?: boolean }) => commit([{ path, id: docId, kind: 'set', data, merge: opts?.merge }]),
      update: (data: MockData) => commit([{ path, id: docId, kind: 'update', data }]),
      delete: () => commit([{ path, id: docId, kind: 'delete' }]),
      onSnapshot: (onNext: (snap: unknown) => void) => {
        const listener = { run: () => onNext(snapOf(path, docId)) };
        mockDb.listeners.push(listener);
        Promise.resolve().then(listener.run);
        return () => { mockDb.listeners = mockDb.listeners.filter((l) => l !== listener); };
      },
    };
  };
  const query = (path: string, filters: MockFilter[] = [], order?: [string, string], limit?: number): unknown => {
    const run = () => {
      let docs = Object.entries(mockDb.docs[path] ?? {}).filter(([, data]) => filters.every((f) => matches(data, f)));
      if (order) {
        const [field, dir] = order;
        docs.sort(([, a], [, b]) => String(a[field]).localeCompare(String(b[field])) * (dir === 'desc' ? -1 : 1));
      }
      if (limit != null) docs = docs.slice(0, limit);
      return {
        empty: docs.length === 0,
        docs: docs.map(([id, data]) => ({ id, data: () => ({ ...data }), ref: docRef(path, id) })),
        metadata: { fromCache: mockDb.offline },
      };
    };
    return {
      where: (field: string, op: string, v: unknown) => query(path, [...filters, { field, op, value: v }], order, limit),
      orderBy: (field: string, dir = 'asc') => query(path, filters, [field, dir], limit),
      limit: (n: number) => query(path, filters, order, n),
      startAfter: () => query(path, filters, order, limit),
      get: async (opts?: { source?: string }) => {
        if (mockDb.offline && opts?.source === 'server') throw unavailable();
        return run();
      },
      onSnapshot: (onNext: (snap: unknown) => void) => {
        let seen = new Map<string, string>();
        const listener = {
          run: () => {
            const snap = run() as { docs: { id: string; data: () => MockData }[] };
            const now = new Map(snap.docs.map((d) => [d.id, JSON.stringify(d.data())]));
            const changes = snap.docs.filter((d) => seen.get(d.id) !== now.get(d.id))
              .map((d) => ({ type: seen.has(d.id) ? 'modified' : 'added', doc: d }));
            seen = now;
            onNext({ ...snap, docChanges: () => changes });
          },
        };
        mockDb.listeners.push(listener);
        Promise.resolve().then(listener.run);
        return () => { mockDb.listeners = mockDb.listeners.filter((l) => l !== listener); };
      },
      doc: (id?: string) => docRef(path, id),
    };
  };
  const split = (ref: { path: string }) => {
    const i = ref.path.lastIndexOf('/');
    return { path: ref.path.slice(0, i), id: ref.path.slice(i + 1) };
  };
  const instance = {
    collection: (name: string) => query(name),
    waitForPendingWrites: () => (mockDb.queue.length
      ? new Promise<void>((resolve) => { mockDb.waiters.push(resolve); })
      : Promise.resolve()),
    batch: () => {
      const ops: MockOp[] = [];
      return {
        set: (ref: { path: string }, data: MockData, opts?: { merge?: boolean }) => { ops.push({ ...split(ref), kind: 'set', data, merge: opts?.merge }); },
        update: (ref: { path: string }, data: MockData) => { ops.push({ ...split(ref), kind: 'update', data }); },
        delete: (ref: { path: string }) => { ops.push({ ...split(ref), kind: 'delete' }); },
        commit: () => commit(ops),
      };
    },
  };
  return {
    __esModule: true,
    default: Object.assign(() => instance, { FieldValue, Timestamp, FieldPath: { documentId: () => '__id__' }, apply }),
  };
});
jest.mock('@react-native-firebase/auth', () => ({
  __esModule: true,
  default: () => ({ currentUser: { uid: mockAuth.uid, displayName: null, email: `${mockAuth.uid}@test.dev` } }),
}));
jest.mock('../../services/crashReporting', () => ({ reportError: jest.fn() }));
jest.mock('../../store/settingsStore', () => ({
  useSettingsStore: { getState: () => ({ displayName: mockAuth.uid === 'u1' ? 'Luis' : 'Ana' }) },
}));
jest.mock('../store/notices', () => ({ notifyRejected: jest.fn((what: string) => { mockNotices.push(what); }) }));
// Los textos de verdad, en español, con lo mínimo de i18next (claves, {{n}} y plurales)
jest.mock('../../i18n', () => {
  const es = jest.requireActual('../../i18n/locales/es.json');
  const t = (key: string, opts: Record<string, unknown> = {}) => {
    const find = (k: string) => k.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown> | undefined)?.[p], es);
    let raw = find(key);
    if (raw === undefined && typeof opts.count === 'number') raw = find(`${key}_${opts.count === 1 ? 'one' : 'other'}`);
    if (typeof raw !== 'string') return key;
    return raw.replace(/\{\{(\w+)\}\}/g, (_, name) => String(opts[name] ?? ''));
  };
  return { __esModule: true, default: { t, language: 'es' } };
});

const flush = async () => { for (let i = 0; i < 25; i++) await new Promise((r) => setTimeout(r, 0)); };
const store = () => useBusinessStore.getState();
const docs = (path: string) => mockDb.docs[path] ?? {};

const createPizzeria = async () => {
  const business = await store().createBusiness({
    name: 'Pizzería Napoli', template: 'pizzeria', mode: 'expert', salesMethod: 'orders',
    channels: ['cash', 'card', 'platform0'], workers: ['Ana', 'Marta'], currencyCode: 'EUR',
  });
  await store().activate();
  await flush();
  return business;
};

const pizzaLine = (sizeId: 's_medium' | 's_family', qty = 1, extras: OrderLine['extras'] = []): OrderLine => {
  const product = store().catalog!.products.p_bbq;
  const size = product.sizes![sizeId];
  return {
    key: `${sizeId}${qty}`, productId: 'p_bbq', categoryId: product.categoryId, name: product.name,
    sizeId, sizeName: size.name, unitPrice: size.price, qty, extras,
  };
};

beforeEach(async () => {
  await AsyncStorage.clear();
  mockDb.docs = {};
  mockDb.clock = Date.now();
  mockDb.listeners = [];
  mockDb.rules = null;
  mockDb.offline = false;
  mockDb.queue = [];
  mockDb.waiters = [];
  mockAuth.uid = 'u1';
  mockNotices.length = 0;
  (notifyRejected as jest.Mock).mockClear();
  store().reset();
});

describe('crear la empresa', () => {
  it('guarda la empresa, su código, la configuración de la plantilla y su carta', async () => {
    const business = await createPizzeria();
    expect(docs('businesses')[business.id]).toMatchObject({
      name: 'Pizzería Napoli', createdBy: 'u1', members: ['u1'], memberNames: { u1: 'Luis' }, template: 'pizzeria',
    });
    expect(docs('businessInviteCodes')[business.inviteCode]).toMatchObject({ businessId: business.id, name: 'Pizzería Napoli' });
    const config = docs(`businesses/${business.id}/config`).main;
    expect(Object.values(config.channels as Record<string, { name: string }>).map((c) => c.name)).toEqual(['Efectivo', 'Tarjeta', 'Glovo']);
    expect((config.channels as Record<string, { commissionPct?: number }>).platform0.commissionPct).toBe(30);
    expect(Object.values(config.workers as Record<string, { name: string }>).map((w) => w.name)).toEqual(['Ana', 'Marta']);
    const catalog = docs(`businesses/${business.id}/catalog`).main as { products: Record<string, { name: string; sizes?: Record<string, { price: number }> }> };
    expect(catalog.products.p_bbq.name).toBe('Barbacoa');
    expect(catalog.products.p_bbq.sizes?.s_family.price).toBe(14.5);
    // Y se está en ella, con su paleta
    expect(useBusinessModeStore.getState()).toEqual({ active: true, paletteId: 'charcoal' });
  });

  it('no deja crear otra si ya estás en una', async () => {
    await createPizzeria();
    store().reset();
    await expect(store().createBusiness({
      name: 'Otra', template: 'blank', mode: 'simple', salesMethod: 'tills', channels: ['cash'], workers: [], currencyCode: 'EUR',
    })).rejects.toThrow('already_in_business');
  });
});

describe('pedidos', () => {
  it('guarda la copia del precio: cambiar la carta no cambia lo vendido', async () => {
    const business = await createPizzeria();
    const result = await store().saveOrder({
      lines: [pizzaLine('s_family', 2, [{ extraId: 'x_cheese', name: 'Extra de queso', price: 1 }])],
      channelId: 'card',
    });
    expect(result).toBe('ok');
    await flush();
    const [orderId, order] = Object.entries(docs(`businesses/${business.id}/orders`))[0];
    expect(order).toMatchObject({ total: 31, channelName: 'Tarjeta', status: 'ok', by: 'u1' });
    expect((order.lines as OrderLine[])[0]).toMatchObject({ name: 'Barbacoa', sizeName: 'Familiar', unitPrice: 14.5, qty: 2 });

    await store().saveCatalogItem('products', 'p_bbq', {
      ...store().catalog!.products.p_bbq,
      sizes: { ...store().catalog!.products.p_bbq.sizes, s_family: { name: 'Familiar', price: 16, order: 2 } },
    });
    await flush();
    expect(docs(`businesses/${business.id}/catalog`).main).toMatchObject({ products: { p_bbq: { sizes: { s_family: { price: 16 } } } } });
    expect(docs(`businesses/${business.id}/orders`)[orderId].total).toBe(31);
    expect(store().orders[orderId].lines[0].unitPrice).toBe(14.5);
  });

  it('anular deja el pedido tachado y una línea en el historial con lo que era', async () => {
    const business = await createPizzeria();
    await store().saveOrder({ lines: [pizzaLine('s_medium')], channelId: 'cash' });
    await flush();
    const orderId = Object.keys(store().orders)[0];
    expect(await store().voidOrder(orderId)).toBe('ok');
    await flush();
    expect(docs(`businesses/${business.id}/orders`)[orderId]).toMatchObject({ status: 'void', voidedBy: 'u1' });
    const changes = Object.values(docs(`businesses/${business.id}/changes`));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: 'order', action: 'void', targetId: orderId, by: 'u1', byName: 'Luis', before: { total: 9.5 } });
  });

  it('con el día cerrado no deja apuntar; si la nube lo rechaza, se quita de la copia y se avisa', async () => {
    const business = await createPizzeria();
    const today = Object.keys(store().days)[0] ?? null;
    expect(today).toBeNull();
    // Las reglas: pedidos solo en un día abierto
    mockDb.rules = (op, all) => {
      if (!op.path.endsWith('/orders') || op.kind === 'delete') return true;
      const day = (op.data?.day ?? all[op.path]?.[op.id]?.day) as string;
      const status = all[`businesses/${business.id}/days`]?.[day]?.status ?? 'open';
      return status === 'open';
    };
    // Otro socio cierra el día en la nube, y este móvil aún no lo sabe
    const { businessToday } = jest.requireActual('../store/businessStore');
    await firestore().collection('businesses').doc(business.id).collection('days').doc(businessToday())
      .set({ id: businessToday(), status: 'closed', updatedAt: firestore.FieldValue.serverTimestamp() });
    expect(await store().saveOrder({ lines: [pizzaLine('s_medium')], channelId: 'cash' })).toBe('ok');
    await flush();
    expect(Object.keys(docs(`businesses/${business.id}/orders`))).toHaveLength(0);
    expect(Object.keys(store().orders)).toHaveLength(0);
    expect(mockNotices).toEqual(['order']);
    // Y cuando el móvil ya sabe que está cerrado, ni lo intenta
    expect(await store().saveOrder({ lines: [pizzaLine('s_medium')], channelId: 'cash' })).toBe('dayClosed');
  });
});

describe('cerrar el día de pedidos', () => {
  it('baja los pedidos del servidor, guarda el resumen y lo confirmado, y apunta la comisión', async () => {
    const business = await createPizzeria();
    await store().saveOrder({ lines: [pizzaLine('s_family')], channelId: 'card' });
    await store().saveOrder({ lines: [pizzaLine('s_medium', 2)], channelId: 'cash' });
    await flush();
    const today = Object.values(store().orders)[0].day;

    // Un pedido de otro socio que este móvil aún no tiene
    await firestore().collection('businesses').doc(business.id).collection('orders').doc('deOtro').set({
      id: 'deOtro', day: today, at: new Date().toISOString(), lines: [pizzaLine('s_medium')], total: 9.5,
      channelId: 'cash', channelName: 'Efectivo', status: 'ok', by: 'u2', updatedAt: firestore.FieldValue.serverTimestamp(),
    });

    // Lo de Glovo, a mano; y el cajón, con 2 € de menos
    const result = await store().closeDay(today, { adjust: { platform0: 96 }, float: 100, counted: 126.5 });
    expect(result).toBe('ok');
    await flush();
    const day = docs(`businesses/${business.id}/days`)[today] as {
      status: string; entries: Record<string, { amounts: Record<string, number> }>; ordersSummary: { count: number; total: number };
    };
    expect(day.status).toBe('closed');
    expect(day.ordersSummary).toMatchObject({ count: 3, total: 43 });
    // Los pedidos dicen 28,50 en efectivo (con el del otro socio) y 14,50 con tarjeta
    expect(day.entries.close.amounts).toEqual({ card: 14.5, cash: 28.5, platform0: 96 });
    // El pedido del otro socio, también en este móvil
    expect(store().orders.deOtro).toBeDefined();
    // La comisión de Glovo (30 % de 96), como gasto
    const commission = docs(`businesses/${business.id}/expenses`)[`com_${today.replace(/-/g, '')}_platform0`];
    expect(commission).toMatchObject({ amount: 28.8, typeId: 'commissions', name: 'Comisión de Glovo' });
    // Y ya no se puede apuntar en ese día
    expect(await store().saveOrder({ lines: [pizzaLine('s_medium')], channelId: 'cash' })).toBe('dayClosed');
  });

  it('reabrir deja rastro y vuelve a dejar apuntar; al cerrar otra vez, se rehace todo', async () => {
    const business = await createPizzeria();
    await store().saveOrder({ lines: [pizzaLine('s_family')], channelId: 'card' });
    await flush();
    const today = Object.values(store().orders)[0].day;
    await store().closeDay(today, { adjust: { platform0: 50 } });
    await flush();
    await store().reopenDay(today);
    await flush();
    expect(docs(`businesses/${business.id}/days`)[today]).toMatchObject({ status: 'open', reopenedBy: 'u1' });
    const reopen = Object.values(docs(`businesses/${business.id}/changes`)).find((c) => c.action === 'reopen');
    expect(reopen).toMatchObject({ kind: 'day', targetId: today, before: { status: 'closed' } });

    expect(await store().saveOrder({ lines: [pizzaLine('s_medium')], channelId: 'card' })).toBe('ok');
    await flush();
    // Sin Glovo esta vez: la comisión de antes se quita
    await store().closeDay(today, {});
    await flush();
    const day = docs(`businesses/${business.id}/days`)[today] as { entries: { close: { amounts: Record<string, number> } } };
    expect(day.entries.close.amounts).toEqual({ card: 24 });
    expect(docs(`businesses/${business.id}/expenses`)[`com_${today.replace(/-/g, '')}_platform0`]).toBeUndefined();
  });
});

describe('cajas (por caja y Sencillo)', () => {
  it('cada caja va en su campo: dos socios no se pisan, y cerrar fija el día', async () => {
    const business = await store().createBusiness({
      name: 'Súper El Sol', template: 'shop', mode: 'expert', salesMethod: 'tills',
      channels: ['cash', 'card'], workers: ['Ana', 'Luis'], currencyCode: 'EUR',
    });
    await store().activate();
    await flush();
    const today = jest.requireActual('../store/businessStore').businessToday();
    await store().saveEntry(today, { workerId: 'w1', amounts: { cash: 1240.5, card: 2310.2 }, channelNames: {}, tickets: 212 });
    await flush();
    // Otro socio apunta su caja a la vez, en su campo
    await firestore().collection('businesses').doc(business.id).collection('days').doc(today)
      .update({ 'entries.otra': { id: 'otra', workerId: 'w2', amounts: { cash: 860 }, channelNames: {}, by: 'u2', at: '' }, updatedAt: firestore.FieldValue.serverTimestamp() });
    await flush();
    // Y este móvil cambia la suya: la del otro socio se queda
    const mine = Object.keys(store().days[today].entries).find((id) => id !== 'otra')!;
    await store().saveEntry(today, { id: mine, workerId: 'w1', amounts: { cash: 1250 }, channelNames: {}, tickets: 213 });
    await flush();
    const entries = (docs(`businesses/${business.id}/days`)[today] as { entries: Record<string, { amounts: Record<string, number> }> }).entries;
    expect(Object.keys(entries).sort()).toEqual([mine, 'otra'].sort());
    // Al cambiarla se reescribe entera: la tarjeta que ya no está, no se queda
    expect(entries[mine].amounts).toEqual({ cash: 1250 });
    expect(entries.otra.amounts).toEqual({ cash: 860 });
    const edit = Object.values(docs(`businesses/${business.id}/changes`)).find((c) => c.kind === 'entry');
    expect(edit).toMatchObject({ action: 'edit', before: { amounts: { cash: 1240.5, card: 2310.2 } } });

    expect(await store().closeDay(today)).toBe('ok');
    await flush();
    expect(docs(`businesses/${business.id}/days`)[today]).toMatchObject({ status: 'closed', closedBy: 'u1' });
    expect(await store().saveEntry(today, { amounts: { cash: 1 }, channelNames: {} })).toBe('dayClosed');
  });
});

describe('fijos', () => {
  it('crean su gasto de cada mes una sola vez, y un mes borrado no vuelve', async () => {
    const business = await createPizzeria();
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2, 1);
    // Un fijo que ya existía (de otro móvil), del día 1
    await firestore().collection('businesses').doc(business.id).collection('recurring').doc('r1').set({
      id: 'r1', name: 'Alquiler', amount: 1200, typeId: 'rent', typeName: 'Alquiler', day: 1, active: true,
      by: 'u2', createdAt: twoMonthsAgo.toISOString(), updatedAt: firestore.FieldValue.serverTimestamp(),
    });
    await store().sync();
    await store().applyRecurring();
    await flush();
    const months = [0, 1, 2].map((back) => {
      const d = new Date();
      d.setMonth(d.getMonth() - back, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const expected = months.map((m) => recurringExpenseId('r1', m)).sort();
    const created = Object.keys(docs(`businesses/${business.id}/expenses`)).filter((id) => id.startsWith('rec_')).sort();
    expect(created).toEqual(expected);

    // Otra vez: nada nuevo
    await store().applyRecurring();
    await flush();
    expect(Object.keys(docs(`businesses/${business.id}/expenses`)).filter((id) => id.startsWith('rec_'))).toHaveLength(3);

    // Se borra el de este mes: queda apuntado en el fijo y no se vuelve a crear
    await store().deleteExpense(recurringExpenseId('r1', months[0]));
    await flush();
    expect(docs(`businesses/${business.id}/recurring`).r1.skipped).toEqual([months[0]]);
    expect(docs(`businesses/${business.id}/deletedExpenses`)[recurringExpenseId('r1', months[0])]).toBeDefined();
    await store().applyRecurring();
    await flush();
    expect(docs(`businesses/${business.id}/expenses`)[recurringExpenseId('r1', months[0])]).toBeUndefined();
  });
});

describe('socios', () => {
  it('se entra con el código y la aprobación de quien la creó; como mucho 5', async () => {
    const business = await createPizzeria();
    // Otra persona pide entrar
    mockAuth.uid = 'u2';
    store().reset();
    expect(await store().requestJoin(` ${business.inviteCode.toLowerCase()} `)).toBe('pending');
    expect(docs(`businesses/${business.id}/joinRequests`).u2).toMatchObject({ uid: 'u2', status: 'pending', displayName: 'Ana' });
    expect(store().pendingRequest).toMatchObject({ businessId: business.id, businessName: 'Pizzería Napoli' });
    expect(await store().requestJoin('NOEXISTE')).toBe('has_pending');

    // Quien la creó la acepta
    mockAuth.uid = 'u1';
    store().reset();
    await store().refreshMembership();
    await store().approveRequest('u2');
    expect(docs('businesses')[business.id]).toMatchObject({ members: ['u1', 'u2'], memberNames: { u1: 'Luis', u2: 'Ana' } });
    expect(docs(`businesses/${business.id}/joinRequests`).u2).toBeUndefined();

    // Con 5 ya no cabe nadie más
    await firestore().collection('businesses').doc(business.id).update({ members: ['u1', 'u2', 'u3', 'u4', 'u5'] });
    await flush();
    await firestore().collection('businesses').doc(business.id).collection('joinRequests').doc('u6')
      .set({ uid: 'u6', displayName: 'Sexto', status: 'pending', requestedAt: '' });
    await expect(store().approveRequest('u6')).rejects.toThrow('full');
  });

  it('un código que no existe no lleva a ningún sitio', async () => {
    await createPizzeria();
    mockAuth.uid = 'u3';
    store().reset();
    expect(await store().requestJoin('ZZZZZZ')).toBe('invalid');
    expect(await store().requestJoin('a/b')).toBe('invalid');
  });
});

describe('sin conexión', () => {
  const today = () => jest.requireActual('../store/businessStore').businessToday() as string;
  // Las reglas: pedidos solo en un día abierto
  const ordersNeedOpenDay = (businessId: string) => (op: MockOp, all: Record<string, Record<string, MockData>>) => {
    if (!op.path.endsWith('/orders') || op.kind === 'delete') return true;
    const day = (op.data?.day ?? all[op.path]?.[op.id]?.day) as string;
    return (all[`businesses/${businessId}/days`]?.[day]?.status ?? 'open') === 'open';
  };

  it('cerrar un día de pedidos sin conexión no deja nada a medias: sigue abierto y lo de después se guarda', async () => {
    const business = await createPizzeria();
    mockDb.rules = ordersNeedOpenDay(business.id);
    mockDb.offline = true;
    expect(await store().closeDay(today(), {})).toBe('offline');
    expect(mockDb.queue).toHaveLength(0);
    expect(await store().saveOrder({ lines: [pizzaLine('s_medium')], channelId: 'cash' })).toBe('ok');
    await mockDb.goOnline();
    await flush();
    expect(docs(`businesses/${business.id}/days`)[today()]).toBeUndefined();
    expect(Object.keys(docs(`businesses/${business.id}/orders`))).toHaveLength(1);
    expect(mockNotices).toEqual([]);
  });

  it('al cerrar, primero suben los pedidos de este móvil que esperaban en la cola', async () => {
    const business = await createPizzeria();
    mockDb.rules = ordersNeedOpenDay(business.id);
    mockDb.offline = true;
    await store().saveOrder({ lines: [pizzaLine('s_family')], channelId: 'card' });
    await store().saveOrder({ lines: [pizzaLine('s_medium')], channelId: 'cash' });
    // Vuelve la red, y la cola aún no ha subido
    mockDb.offline = false;
    const closing = store().closeDay(today(), {});
    await flush();
    expect(docs(`businesses/${business.id}/days`)[today()]).toBeUndefined();
    await mockDb.goOnline();
    expect(await closing).toBe('ok');
    await flush();
    expect(docs(`businesses/${business.id}/days`)[today()]).toMatchObject({ status: 'closed', ordersSummary: { count: 2, total: 24 } });
    expect(mockNotices).toEqual([]);
  });

  it('un pedido que la nube rechazó con la app cerrada se quita al abrirla, y se avisa', async () => {
    const business = await createPizzeria();
    await store().saveOrder({ lines: [pizzaLine('s_medium')], channelId: 'cash' });
    await flush();
    const saved = Object.values(store().orders)[0];
    expect(saved.updatedAt).toBeDefined();
    // De la sesión anterior: uno que la nube no tiene (lo rechazó: otro socio
    // cerró el día) y otro que sí subió, sin la confirmación aún en el móvil
    const lost: Order = { ...saved, id: 'perdido', total: 99, updatedAt: undefined };
    useBusinessStore.setState({ orders: { perdido: lost, [saved.id]: { ...saved, updatedAt: undefined } } });
    await store().deactivate();
    await store().activate();
    await new Promise((resolve) => setTimeout(resolve, 2100));
    await flush();
    expect(store().orders.perdido).toBeUndefined();
    expect(store().orders[saved.id]?.updatedAt).toBeDefined();
    expect(mockNotices).toEqual(['order']);
    const copy = JSON.parse((await AsyncStorage.getItem(`@moflo_biz_${business.id}_orders_${saved.day}`)) ?? '{}');
    expect(Object.keys(copy)).toEqual([saved.id]);
  });

  it('si con la app cerrada te cambiaron de empresa, al abrirla no pasa nada de la anterior a la nueva', async () => {
    const x = await createPizzeria();
    await store().saveOrder({ lines: [pizzaLine('s_medium')], channelId: 'cash' });
    await flush();
    // La app se cierra con la copia de X; desde otro móvil, fuera de X y dentro de Y
    store().reset();
    await firestore().collection('businesses').doc(x.id).update({ members: ['u9'] });
    await firestore().collection('businesses').doc('y1').set({
      id: 'y1', name: 'Bar Y', createdBy: 'u2', members: ['u2', 'u1'], memberNames: {}, inviteCode: 'YYYYYY',
      createdAt: '', template: 'bar', currencyCode: 'EUR',
    });
    await store().init();
    await flush();
    await flush();
    expect(store().business?.id).toBe('y1');
    expect(store().orders).toEqual({});
    expect((await AsyncStorage.getAllKeys()).filter((k) => k.includes(x.id))).toEqual([]);
  });

  it('si la app arranca sin conexión, sigue escuchando la empresa y ve sus cambios al volver la red', async () => {
    const business = await createPizzeria();
    store().reset();
    mockDb.offline = true;
    await store().init();
    await flush();
    await mockDb.goOnline();
    await firestore().collection('businesses').doc(business.id).update({ name: 'Pizzería Nueva' });
    await flush();
    expect(store().business?.name).toBe('Pizzería Nueva');
  });

  it('lo que llega de la caché de Firestore no sube las marcas', async () => {
    const business = await createPizzeria();
    await store().saveOrder({ lines: [pizzaLine('s_medium')], channelId: 'cash' });
    await flush();
    const before = await readBizMark('orders', business.id);
    expect(before).not.toBeNull();
    // Fuera de la empresa (sin escuchas), otro socio apunta un pedido
    await store().deactivate();
    await firestore().collection('businesses').doc(business.id).collection('orders').doc('deOtro').set({
      id: 'deOtro', day: today(), at: '', lines: [], total: 5, channelId: 'cash', channelName: 'Efectivo',
      status: 'ok', by: 'u2', updatedAt: firestore.FieldValue.serverTimestamp(),
    });
    mockDb.offline = true;
    await store().sync();
    expect(await readBizMark('orders', business.id)).toBe(before);
    await mockDb.goOnline();
    await store().sync();
    expect(await readBizMark('orders', business.id)).toBeGreaterThan(before!);
  });

  it('borrar la empresa sin conexión avisa y no borra nada; con conexión, todo, también lo que no está en el móvil', async () => {
    const business = await createPizzeria();
    await firestore().collection('businesses').doc(business.id).collection('orders').doc('deOtro').set({
      id: 'deOtro', day: '2026-01-02', total: 5, status: 'ok', updatedAt: firestore.FieldValue.serverTimestamp(),
    });
    mockDb.offline = true;
    await expect(store().deleteBusiness()).rejects.toMatchObject({ code: 'offline' });
    expect(mockDb.queue).toHaveLength(0);
    expect(docs('businesses')[business.id]).toBeDefined();
    mockDb.offline = false;
    await store().deleteBusiness();
    expect(docs('businesses')[business.id]).toBeUndefined();
    expect(docs('businessInviteCodes')[business.inviteCode]).toBeUndefined();
    for (const name of ['config', 'catalog', 'orders']) expect(docs(`businesses/${business.id}/${name}`)).toEqual({});
  });

  it('salir de la empresa sin conexión avisa y no deja nada en la cola', async () => {
    const business = await createPizzeria();
    await firestore().collection('businesses').doc(business.id).update({ members: ['u1', 'u2'] });
    mockAuth.uid = 'u2';
    store().reset();
    await store().refreshMembership();
    await flush();
    mockDb.offline = true;
    await expect(store().leaveBusiness()).rejects.toMatchObject({ code: 'offline' });
    expect(mockDb.queue).toHaveLength(0);
    await mockDb.goOnline();
    await store().leaveBusiness();
    expect(docs('businesses')[business.id].members).toEqual(['u1']);
  });
});
