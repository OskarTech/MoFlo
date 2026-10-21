import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';
import { useBusinessStore } from '../store/businessStore';
import { useBusinessModeStore } from '../store/modeStore';
import { recurringExpenseId } from '../logic/recurring';
import { readBizMark } from '../cloud/sync';

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
// En la app solo la ven las cuentas de la lista (ver access); aquí, todas
jest.mock('../access', () => ({ businessAllowed: () => true }));
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
  const business = await store().createBusiness({ name: 'Pizzería Vesuvio', currencyCode: 'EUR' });
  await store().activate();
  await flush();
  return business;
};

const today = () => jest.requireActual('../store/businessStore').businessToday() as string;
const comId = (day: string, channel: string) => `com_${day.replace(/-/g, '')}_${channel}`;

/** Lo que escribe el servidor al llegar el cierre de la caja (ver functions/src/business.ts) */
const posCloses = async (businessId: string, day: string, amounts: Record<string, number>, counts?: Record<string, number>) => {
  await firestore().collection('businesses').doc(businessId).collection('days').doc(day).set({
    id: day, status: 'closed', closedBy: 'pos', closedAt: new Date().toISOString(),
    entries: {
      pos: {
        id: 'pos', amounts, channelNames: {}, tickets: 37, pending: 0, vat: [], closedAtMs: Date.now(),
        by: 'pos', at: new Date().toISOString(), ...(counts ? { counts } : {}),
      },
    },
    updatedAt: firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  await flush();
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
  store().reset();
});

describe('crear la empresa', () => {
  it('guarda la empresa, su código y la configuración de una pizzería', async () => {
    const business = await createPizzeria();
    expect(docs('businesses')[business.id]).toMatchObject({
      name: 'Pizzería Vesuvio', createdBy: 'u1', members: ['u1'], memberNames: { u1: 'Luis' }, template: 'pizzeria',
    });
    expect(docs('businessInviteCodes')[business.inviteCode]).toMatchObject({ businessId: business.id, name: 'Pizzería Vesuvio' });
    const config = docs(`businesses/${business.id}/config`).main as {
      channels: Record<string, { name: string }>; expenseTypes: Record<string, { name: string; vatRate: number }>;
    };
    expect(Object.entries(config.channels).map(([id, c]) => [id, c.name])).toEqual([['cash', 'Efectivo'], ['card', 'Tarjeta'], ['online', 'Online']]);
    expect(config.expenseTypes.ingredients).toMatchObject({ name: 'Materia prima', vatRate: 10 });
    expect(config.expenseTypes.vat.name).toBe('IVA (modelo 303)');
    expect(config).toMatchObject({ salesVatRate: 10, corporateTaxRate: 15 });
    expect(docs(`businesses/${business.id}/catalog`)).toEqual({});
    // Y se está en ella, con su paleta
    expect(useBusinessModeStore.getState()).toEqual({ active: true, paletteId: 'charcoal' });
  });

  it('no deja crear otra si ya estás en una', async () => {
    await createPizzeria();
    store().reset();
    await expect(store().createBusiness({ name: 'Otra', currencyCode: 'EUR' })).rejects.toThrow('already_in_business');
  });
});

describe('ventas a mano', () => {
  it('apuntar un día sin cerrar lo cierra; cada venta va en su campo y dos socios no se pisan', async () => {
    const business = await createPizzeria();
    expect(await store().saveEntry(today(), { amounts: { cash: 300, card: 200 }, channelNames: {} })).toBe('ok');
    await flush();
    const dayDoc = () => docs(`businesses/${business.id}/days`)[today()] as {
      status: string; closedBy: string; entries: Record<string, { amounts: Record<string, number> }>;
    };
    expect(dayDoc()).toMatchObject({ status: 'closed', closedBy: 'u1' });
    // Otro socio apunta otra a la vez, en su campo
    await firestore().collection('businesses').doc(business.id).collection('days').doc(today())
      .update({ 'entries.otra': { id: 'otra', amounts: { cash: 80 }, channelNames: {}, by: 'u2', at: '' }, updatedAt: firestore.FieldValue.serverTimestamp() });
    await flush();
    // Y este móvil cambia la suya: la del otro socio se queda, y quien cerró el día también
    const mine = Object.keys(store().days[today()].entries).find((id) => id !== 'otra')!;
    await store().saveEntry(today(), { id: mine, amounts: { cash: 310 }, channelNames: {} });
    await flush();
    expect(Object.keys(dayDoc().entries).sort()).toEqual([mine, 'otra'].sort());
    // Al cambiarla se reescribe entera: la tarjeta que ya no está, no se queda
    expect(dayDoc().entries[mine].amounts).toEqual({ cash: 310 });
    expect(dayDoc().closedBy).toBe('u1');
    const edit = Object.values(docs(`businesses/${business.id}/changes`)).find((c) => c.kind === 'entry');
    expect(edit).toMatchObject({ action: 'edit', by: 'u1', before: { amounts: { cash: 300, card: 200 } } });
  });

  it('lo de la caja no se toca desde la app, y lo de a mano se suma a lo suyo', async () => {
    const business = await createPizzeria();
    await posCloses(business.id, today(), { cash: 450, card: 600, online: 184.5 });
    expect(store().days[today()].entries.pos).toBeDefined();
    expect(await store().saveEntry(today(), { id: 'pos', amounts: { cash: 1 }, channelNames: {} })).toBe('pos');
    expect(await store().deleteEntry(today(), 'pos')).toBe('pos');
    await store().saveEntry(today(), { amounts: { cash: 50 }, channelNames: {} });
    await flush();
    const day = docs(`businesses/${business.id}/days`)[today()] as { closedBy: string; entries: Record<string, { amounts: Record<string, number> }> };
    // Sigue cerrado por la caja, con lo suyo intacto
    expect(day.closedBy).toBe('pos');
    expect(day.entries.pos.amounts).toEqual({ cash: 450, card: 600, online: 184.5 });
    expect(Object.keys(day.entries)).toHaveLength(2);
  });

  it('las comisiones se rehacen con cada cambio de lo vendido, sobre todo lo del día', async () => {
    const business = await createPizzeria();
    await store().saveConfigItem('channels', 'card', { ...store().config!.channels.card, commissionPct: 0.5 });
    await store().saveConfigItem('channels', 'online', { ...store().config!.channels.online, commissionPct: 1.5, commissionFixed: 0.25 });
    await posCloses(business.id, today(), { cash: 450, card: 600, online: 184.5 }, { online: 12 });
    // Una venta a mano con tarjeta: la comisión del día, con lo de la caja
    await store().saveEntry(today(), { amounts: { card: 200 }, channelNames: {} });
    await flush();
    const expenses = () => docs(`businesses/${business.id}/expenses`);
    expect(expenses()[comId(today(), 'card')]).toMatchObject({ amount: 4, typeId: 'commissions', name: 'Comisión de Tarjeta' });
    // Online: el 1,5 % de 184,50 y 0,25 por cada uno de los 12 cobros
    expect(expenses()[comId(today(), 'online')]).toMatchObject({ amount: 5.77 });
    expect(expenses()[comId(today(), 'cash')]).toBeUndefined();
    // Al borrarla, la de la tarjeta vuelve a ser solo la de la caja
    const mine = Object.keys(store().days[today()].entries).find((id) => id !== 'pos')!;
    await store().deleteEntry(today(), mine);
    await flush();
    expect(expenses()[comId(today(), 'card')].amount).toBe(3);
  });

  it('borrar lo único apuntado deja el día sin cerrar, y su comisión se quita con su apunte de borrado', async () => {
    const business = await createPizzeria();
    await store().saveConfigItem('channels', 'card', { ...store().config!.channels.card, commissionPct: 1 });
    await store().saveEntry(today(), { amounts: { card: 100 }, channelNames: {} });
    await flush();
    const id = comId(today(), 'card');
    expect(docs(`businesses/${business.id}/expenses`)[id].amount).toBe(1);
    const mine = Object.keys(store().days[today()].entries)[0];
    await store().deleteEntry(today(), mine);
    await flush();
    expect(docs(`businesses/${business.id}/days`)[today()]).toMatchObject({ status: 'open', closedBy: null, entries: {} });
    expect(docs(`businesses/${business.id}/expenses`)[id]).toBeUndefined();
    expect(docs(`businesses/${business.id}/deletedExpenses`)[id]).toBeDefined();
    const deletion = Object.values(docs(`businesses/${business.id}/changes`)).find((c) => c.action === 'delete');
    expect(deletion).toMatchObject({ kind: 'entry', before: { amounts: { card: 100 } } });
  });
});

describe('listas de Ajustes', () => {
  it('se añade, se archiva y lo que no se ha usado se borra', async () => {
    const business = await createPizzeria();
    const id = await store().saveConfigItem('expenseTypes', null, { name: 'Leña', icon: 'pricetag', order: 30, vatRate: 21 });
    await flush();
    expect(docs(`businesses/${business.id}/config`).main).toMatchObject({ expenseTypes: { [id]: { name: 'Leña', vatRate: 21 } } });
    await store().deleteConfigItem('expenseTypes', id);
    await flush();
    expect((docs(`businesses/${business.id}/config`).main as { expenseTypes: Record<string, unknown> }).expenseTypes[id]).toBeUndefined();
    expect(store().config!.expenseTypes[id]).toBeUndefined();
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
    expect(store().pendingRequest).toMatchObject({ businessId: business.id, businessName: 'Pizzería Vesuvio' });
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
  it('si con la app cerrada te cambiaron de empresa, al abrirla no pasa nada de la anterior a la nueva', async () => {
    const x = await createPizzeria();
    await store().saveEntry(today(), { amounts: { cash: 100 }, channelNames: {} });
    await flush();
    // La app se cierra con la copia de X; desde otro móvil, fuera de X y dentro de Y
    store().reset();
    await firestore().collection('businesses').doc(x.id).update({ members: ['u9'] });
    await firestore().collection('businesses').doc('y1').set({
      id: 'y1', name: 'Pizzería Y', createdBy: 'u2', members: ['u2', 'u1'], memberNames: {}, inviteCode: 'YYYYYY',
      createdAt: '', template: 'pizzeria', currencyCode: 'EUR',
    });
    await store().init();
    await flush();
    await flush();
    expect(store().business?.id).toBe('y1');
    expect(store().days).toEqual({});
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
    await store().saveEntry(today(), { amounts: { cash: 100 }, channelNames: {} });
    await flush();
    const before = await readBizMark('days', business.id);
    expect(before).not.toBeNull();
    // Fuera de la empresa (sin escuchas), llega el cierre de la caja de otro día
    await store().deactivate();
    await firestore().collection('businesses').doc(business.id).collection('days').doc('2026-01-02').set({
      id: '2026-01-02', status: 'closed', closedBy: 'pos', entries: {}, updatedAt: firestore.FieldValue.serverTimestamp(),
    });
    mockDb.offline = true;
    await store().sync();
    expect(await readBizMark('days', business.id)).toBe(before);
    await mockDb.goOnline();
    await store().sync();
    expect(await readBizMark('days', business.id)).toBeGreaterThan(before!);
  });

  it('borrar la empresa sin conexión avisa y no borra nada; con conexión, todo, también lo que no está en el móvil', async () => {
    const business = await createPizzeria();
    await firestore().collection('businesses').doc(business.id).collection('days').doc('2026-01-02').set({
      id: '2026-01-02', status: 'closed', entries: {}, updatedAt: firestore.FieldValue.serverTimestamp(),
    });
    mockDb.offline = true;
    await expect(store().deleteBusiness()).rejects.toMatchObject({ code: 'offline' });
    expect(mockDb.queue).toHaveLength(0);
    expect(docs('businesses')[business.id]).toBeDefined();
    mockDb.offline = false;
    await store().deleteBusiness();
    expect(docs('businesses')[business.id]).toBeUndefined();
    expect(docs('businessInviteCodes')[business.inviteCode]).toBeUndefined();
    for (const name of ['config', 'days']) expect(docs(`businesses/${business.id}/${name}`)).toEqual({});
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
