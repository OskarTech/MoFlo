import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';
import { useMovementStore } from '../movementStore';
import { useSavingsStore } from '../savingsStore';
import { checkCloudCopy } from '../checkCloudCopy';
import {
  FULL_CHECK_EVERY_MS, isFullCheckDue, lastFullCheck, markFullCheck, readMark, removeCloudChecks,
} from '../cloudCheck';
import { deleteFromCloud, listenToCloudChanges } from '../../services/firebase/cloudSync';
import { reportError } from '../../services/crashReporting';
import { sharedCacheKey, SHARED_CACHE } from '../sharedCache';
import { HuchaMovement, Movement } from '../../types';

// Firestore falsa en memoria, que hace de servidor: guarda lo que se escribe
// (con la hora del servidor, increment, lotes y transacciones), responde a
// where (">=" y "=="), orderBy y limit, avisa a las escuchas en directo tras
// cada escritura y puede rechazar escrituras como las reglas. Apunta cada
// lectura para ver qué se ha pedido a la nube y cuántos documentos ha traído
type MockData = Record<string, unknown>;
type MockOp = { path: string; id: string; kind: 'set' | 'update' | 'delete'; data?: MockData; merge?: boolean };
type MockFilter = { field: string; op: string; value: unknown };
const mockDb = {
  docs: {} as Record<string, Record<string, MockData>>,
  reads: [] as { path: string; filter?: string; limit?: number; count: number }[],
  fromCache: false,
  connected: true,
  // Hora del servidor: avanza 10 minutos con cada escritura, más que el margen
  clock: 0,
  deny: [] as RegExp[],
  denyRead: [] as RegExp[],
  listeners: [] as { run: () => void }[],
};

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
  class Increment {
    n: number;
    constructor(by: number) { this.n = by; }
  }
  const DELETE_FIELD = { deleteField: true };
  const FieldValue = {
    serverTimestamp: () => SERVER_TIME,
    increment: (n: number) => new Increment(n),
    delete: () => DELETE_FIELD,
  };
  const resolve = (prev: MockData | undefined, data: MockData, at: number, merge: boolean): MockData => {
    const out: MockData = merge && prev ? { ...prev } : {};
    for (const [key, value] of Object.entries(data)) {
      if (value === SERVER_TIME) out[key] = new Timestamp(at);
      else if (value instanceof Increment) out[key] = ((prev?.[key] as number) ?? 0) + value.n;
      else if (value === DELETE_FIELD) delete out[key];
      else out[key] = value;
    }
    return out;
  };
  const commit = async (ops: MockOp[]) => {
    if (ops.some((op) => mockDb.deny.some((re) => re.test(`${op.path}/${op.id}`)))) {
      throw Object.assign(new Error('denied'), { code: 'firestore/permission-denied' });
    }
    if (ops.some((op) => op.kind === 'update' && !mockDb.docs[op.path]?.[op.id])) {
      throw Object.assign(new Error('not found'), { code: 'firestore/not-found' });
    }
    mockDb.clock += 10 * 60 * 1000;
    for (const op of ops) {
      const col = (mockDb.docs[op.path] ??= {});
      if (op.kind === 'delete') delete col[op.id];
      else col[op.id] = resolve(col[op.id], op.data!, mockDb.clock, op.kind === 'update' || !!op.merge);
    }
    mockDb.listeners.forEach((l) => l.run());
  };
  const split = (ref: { path: string }) => {
    const i = ref.path.lastIndexOf('/');
    return { path: ref.path.slice(0, i), id: ref.path.slice(i + 1) };
  };
  const matches = (data: MockData, { field, op, value }: MockFilter) => {
    const v = data[field];
    if (op === '==') return v === value;
    if (value instanceof Timestamp) return v instanceof Timestamp && v.ms >= value.ms;
    return typeof v === 'string' && v >= (value as string);
  };
  const docRef = (path: string, id: string): unknown => ({
    id,
    path: `${path}/${id}`,
    collection: (name: string) => query(`${path}/${id}/${name}`),
    get: async () => {
      const data = mockDb.docs[path]?.[id];
      return { id, exists: () => !!data, data: () => (data ? { ...data } : undefined), metadata: { fromCache: mockDb.fromCache } };
    },
    set: (data: MockData, opts?: { merge?: boolean }) => commit([{ path, id, kind: 'set', data, merge: opts?.merge }]),
    update: (data: MockData) => commit([{ path, id, kind: 'update', data }]),
    delete: () => commit([{ path, id, kind: 'delete' }]),
  });
  const query = (path: string, filters: MockFilter[] = [], order?: [string, string], limit?: number): unknown => {
    const run = () => {
      let docs = Object.entries(mockDb.docs[path] ?? {}).filter(([, data]) => filters.every((f) => matches(data, f)));
      if (order) {
        const [field, dir] = order;
        docs.sort(([, a], [, b]) => String(a[field]).localeCompare(String(b[field])) * (dir === 'desc' ? -1 : 1));
      }
      if (limit != null) docs = docs.slice(0, limit);
      mockDb.reads.push({ path, filter: filters[0]?.field, limit, count: docs.length });
      return {
        empty: docs.length === 0,
        docs: docs.map(([id, data]) => ({ id, data: () => ({ ...data }), ref: docRef(path, id) })),
        metadata: { fromCache: mockDb.fromCache },
      };
    };
    return {
      where: (field: string, op: string, value: unknown) => {
        if (op !== '>=' && op !== '==') throw new Error(`Sin preparar para ${op}`);
        return query(path, [...filters, { field, op, value }], order, limit);
      },
      orderBy: (field: string, dir = 'asc') => query(path, filters, [field, dir], limit),
      limit: (n: number) => query(path, filters, order, n),
      get: async () => {
        if (mockDb.denyRead.some((re) => re.test(path))) throw Object.assign(new Error('denied'), { code: 'firestore/permission-denied' });
        return run();
      },
      onSnapshot: (onNext: (snap: unknown) => void, onError: (e: unknown) => void) => {
        // Lo que ya ha avisado esta escucha, para dar solo lo que cambia
        let seen = new Map<string, string>();
        const listener = {
          active: true,
          run: () => {
            if (!listener.active) return;
            if (mockDb.denyRead.some((re) => re.test(path))) {
              listener.active = false;
              onError(Object.assign(new Error('denied'), { code: 'firestore/permission-denied' }));
              return;
            }
            const snap = run() as { docs: { id: string; data: () => MockData }[] };
            const now = new Map(snap.docs.map((d) => [d.id, JSON.stringify(d.data())]));
            const changes = [
              ...snap.docs.filter((d) => seen.get(d.id) !== now.get(d.id))
                .map((d) => ({ type: seen.has(d.id) ? 'modified' : 'added', doc: d })),
              ...[...seen.keys()].filter((id) => !now.has(id))
                .map((id) => ({ type: 'removed', doc: { id, data: () => JSON.parse(seen.get(id)!) } })),
            ];
            seen = now;
            onNext({ ...snap, docChanges: () => changes });
          },
        };
        mockDb.listeners.push(listener);
        Promise.resolve().then(listener.run);
        return () => { listener.active = false; };
      },
      doc: (id: string) => docRef(path, id),
    };
  };
  const writer = (ops: MockOp[]) => ({
    set: (ref: { path: string }, data: MockData, opts?: { merge?: boolean }) => { ops.push({ ...split(ref), kind: 'set', data, merge: opts?.merge }); },
    update: (ref: { path: string }, data: MockData) => { ops.push({ ...split(ref), kind: 'update', data }); },
    delete: (ref: { path: string }) => { ops.push({ ...split(ref), kind: 'delete' }); },
  });
  const instance = {
    collection: (name: string) => query(name),
    batch: () => {
      const ops: MockOp[] = [];
      return { ...writer(ops), commit: () => commit(ops) };
    },
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const ops: MockOp[] = [];
      const result = await fn({ ...writer(ops), get: (ref: { get: () => unknown }) => ref.get() });
      await commit(ops);
      return result;
    },
  };
  return { __esModule: true, default: Object.assign(() => instance, { FieldValue, Timestamp }) };
});
jest.mock('@react-native-firebase/auth', () => ({
  __esModule: true,
  default: () => ({ currentUser: { uid: 'u1' } }),
}));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: async () => ({ isConnected: mockDb.connected }), addEventListener: () => () => {} },
}));
jest.mock('../../services/syncQueue.service', () => ({
  processQueue: jest.fn(async () => {}),
  enqueue: jest.fn(async () => {}),
}));
jest.mock('../../i18n', () => ({ __esModule: true, default: { t: (k: string) => k }, getDeviceLanguage: () => 'es' }));
jest.mock('../../services/crashReporting', () => ({ reportError: jest.fn() }));
jest.mock('../../utils/rateAppPrompt', () => ({ maybePromptForRating: jest.fn() }));
const mockShared = { isSharedMode: false, sharedAccount: null as { id: string } | null };
jest.mock('../sharedAccountStore', () => ({ useSharedAccountStore: { getState: () => mockShared } }));

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
// Apuntado hace `days` días, con fecha de ese día salvo que se diga otra
const mov = (id: string, days: number, extra: Record<string, unknown> = {}): Movement => ({
  id, type: 'expense', amount: 10, category: 'food', description: id, date: ago(days),
  isRecurring: false, currency: 'EUR', createdAt: ago(days), ...extra,
});
const hm = (id: string, days: number, extra: Record<string, unknown> = {}): HuchaMovement => ({
  id, huchaId: 'h1', huchaName: 'Viaje', huchaColor: '#000', type: 'deposit', amount: 5,
  date: ago(days), createdAt: ago(days), ...extra,
} as HuchaMovement);
const ids = (list: { id: string }[]) => list.map((m) => m.id).sort();
const readsOf = (path: string) => mockDb.reads.filter((r) => r.path === path);
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); };

const PERSONAL_MOVS = 'users/u1/movements';
const PERSONAL_DELETED = 'users/u1/deletedMovements';
const PERSONAL_RECURRING = 'users/u1/recurring';
const PERSONAL_HUCHA_MOVS = 'users/u1/huchaMovements';
const PERSONAL_HUCHA_DELETED = 'users/u1/deletedHuchaMovements';
const SHARED_MOVS = 'sharedAccounts/S1/movements';
const SHARED_DELETED = 'sharedAccounts/S1/deletedMovements';
const SHARED_HUCHA_MOVS = 'sharedAccounts/S1/huchaMovements';
const SHARED_HUCHA_DELETED = 'sharedAccounts/S1/deletedHuchaMovements';
const RECURRING = { id: 'r1', recurringDay: 1 };

// Otro móvil u otro miembro, con la 2.0.5: guarda con la hora del servidor y
// borra dejando el apunte. Con una versión anterior: sin hora ni apunte
const col = (path: string) => {
  const [first, ...rest] = path.split('/');
  let ref = firestore().collection(first);
  for (let i = 0; i < rest.length; i += 2) ref = ref.doc(rest[i]).collection(rest[i + 1]);
  return ref;
};
const otro = {
  guarda: (path: string, doc: { id: string }) =>
    col(path).doc(doc.id).set({ ...doc, updatedAt: firestore.FieldValue.serverTimestamp() }),
  borra: (accountId: string | null, collection: 'movements' | 'huchaMovements', id: string) =>
    deleteFromCloud(accountId, collection, id),
};
const viejo = {
  guarda: (path: string, doc: { id: string }) => col(path).doc(doc.id).set(doc),
  borra: (path: string, id: string) => col(path).doc(id).delete(),
};
const nube = (path: string) => mockDb.docs[path] ?? {};

const setLocal = (key: string, value: unknown) => AsyncStorage.setItem(key, JSON.stringify(value));
const getLocal = async (key: string) => JSON.parse((await AsyncStorage.getItem(key)) ?? 'null');

// Lo que tiene guardado un móvil, para hacer de otro con la misma cuenta
const guardarMovil = async () => AsyncStorage.multiGet(await AsyncStorage.getAllKeys());
const ponerMovil = async (pairs: readonly (readonly [string, string | null])[]) => {
  await AsyncStorage.clear();
  await AsyncStorage.multiSet(pairs.filter((p): p is [string, string] => p[1] != null));
  useMovementStore.getState().resetStore();
  useSavingsStore.getState().resetStore();
};

beforeEach(async () => {
  await AsyncStorage.clear();
  mockDb.docs = {};
  mockDb.reads = [];
  mockDb.fromCache = false;
  mockDb.connected = true;
  mockDb.clock = Date.now();
  mockDb.deny = [];
  mockDb.denyRead = [];
  mockDb.listeners = [];
  mockShared.isSharedMode = false;
  mockShared.sharedAccount = null;
  useMovementStore.getState().resetStore();
  useSavingsStore.getState().resetStore();
  await removeCloudChecks();
  (reportError as jest.Mock).mockClear();
});

describe('cuenta individual (loadData)', () => {
  it('sin copia en el móvil baja todo, apunta la comprobación y la marca', async () => {
    await otro.guarda(PERSONAL_MOVS, mov('a', 5));
    await otro.guarda(PERSONAL_MOVS, mov('b', 100));
    await viejo.guarda(PERSONAL_MOVS, mov('deLa204', 200));
    await otro.guarda(PERSONAL_RECURRING, RECURRING);
    await useMovementStore.getState().loadData();
    expect(ids(useMovementStore.getState().movements)).toEqual(['a', 'b', 'deLa204']);
    expect(ids(await getLocal('@moflo_movements'))).toEqual(['a', 'b', 'deLa204']);
    expect(await isFullCheckDue('movements', 'u1')).toBe(false);
    // La hora del servidor del último cambio, en ms, y la marca en el más reciente
    const b = (nube(PERSONAL_MOVS).b.updatedAt as { toMillis: () => number }).toMillis();
    expect(useMovementStore.getState().movements.find((m) => m.id === 'b')?.updatedAt).toBe(b);
    expect(await readMark('movements', 'u1')).toBe(b);
  });

  it('después, solo pide lo cambiado: lo de otro móvil llega y lo demás no se vuelve a leer', async () => {
    for (let i = 0; i < 20; i++) await otro.guarda(PERSONAL_MOVS, mov(`m${i}`, 100 + i));
    await otro.guarda(PERSONAL_MOVS, mov('editado', 60));
    await otro.guarda(PERSONAL_MOVS, mov('borrado', 3));
    await useMovementStore.getState().loadData();

    await otro.guarda(PERSONAL_MOVS, mov('nuevo', 0));
    await otro.guarda(PERSONAL_MOVS, mov('editado', 60, { amount: 99 }));
    await otro.borra(null, 'movements', 'borrado');
    mockDb.reads = [];
    await useMovementStore.getState().loadData();

    const byId = Object.fromEntries(useMovementStore.getState().movements.map((m) => [m.id, m]));
    expect(byId.nuevo).toBeDefined();
    expect(byId.editado.amount).toBe(99);
    expect(byId.borrado).toBeUndefined();
    expect(Object.keys(byId)).toHaveLength(22);
    expect(ids(await getLocal('@moflo_movements'))).toEqual(ids(useMovementStore.getState().movements));
    // Dos consultas por la hora, y solo lo cambiado
    expect(readsOf(PERSONAL_MOVS)).toEqual([{ path: PERSONAL_MOVS, filter: 'updatedAt', limit: undefined, count: 2 }]);
    expect(readsOf(PERSONAL_DELETED)).toEqual([{ path: PERSONAL_DELETED, filter: 'updatedAt', limit: undefined, count: 1 }]);

    // Y la vez siguiente, como mucho lo último otra vez (el margen)
    mockDb.reads = [];
    await useMovementStore.getState().loadData();
    expect(readsOf(PERSONAL_MOVS)[0].count).toBeLessThanOrEqual(1);
    expect(Object.keys(byId)).toHaveLength(useMovementStore.getState().movements.length);
  });

  it('lo que cambia una versión anterior (sin hora ni apunte) solo llega con la comprobación entera', async () => {
    await otro.guarda(PERSONAL_MOVS, mov('a', 5));
    await otro.guarda(PERSONAL_MOVS, mov('b', 5));
    await useMovementStore.getState().loadData();

    await viejo.guarda(PERSONAL_MOVS, mov('antiguo', 0));
    await viejo.guarda(PERSONAL_MOVS, mov('a', 5, { amount: 77 }));
    await viejo.borra(PERSONAL_MOVS, 'b');
    await useMovementStore.getState().loadData();
    expect(ids(useMovementStore.getState().movements)).toEqual(['a', 'b']);

    await useMovementStore.getState().loadData({ fullCheck: true });
    expect(ids(useMovementStore.getState().movements)).toEqual(['a', 'antiguo']);
    expect(useMovementStore.getState().movements.find((m) => m.id === 'a')?.amount).toBe(77);
  });

  it('una respuesta de la caché de Firestore no toca la copia ni las marcas', async () => {
    await otro.guarda(PERSONAL_MOVS, mov('a', 5));
    await useMovementStore.getState().loadData();
    const mark = await readMark('movements', 'u1');
    await otro.guarda(PERSONAL_MOVS, mov('b', 1));
    await otro.borra(null, 'movements', 'a');
    mockDb.fromCache = true;
    await useMovementStore.getState().loadData();
    expect(ids(useMovementStore.getState().movements)).toEqual(['a']);
    expect(ids(await getLocal('@moflo_movements'))).toEqual(['a']);
    expect(await readMark('movements', 'u1')).toBe(mark);
    expect(await readMark('deletedMovements', 'u1')).toBe(mark);
  });

  it('con la nube vacía no se borra nada del móvil', async () => {
    await setLocal('@moflo_movements', [mov('a', 5)]);
    await setLocal('@moflo_recurring', [{ id: 'r1', recurringDay: 1 }]);
    await useMovementStore.getState().loadData();
    expect(ids(useMovementStore.getState().movements)).toEqual(['a']);
    expect(ids(useMovementStore.getState().recurringMovements)).toEqual(['r1']);
    expect(await isFullCheckDue('movements', 'u1')).toBe(false);
  });

  it('una cuenta sin nada guarda la copia vacía y en el siguiente inicio solo pide los cambios', async () => {
    await useMovementStore.getState().loadData();
    expect(await getLocal('@moflo_movements')).toEqual([]);
    mockDb.reads = [];
    await useMovementStore.getState().loadData();
    expect(readsOf(PERSONAL_MOVS)).toEqual([{ path: PERSONAL_MOVS, filter: 'updatedAt', limit: undefined, count: 0 }]);
  });

  it('los fijos borrados en otro móvil se quitan, salvo con la nube vacía', async () => {
    await setLocal('@moflo_movements', [mov('a', 5)]);
    await setLocal('@moflo_recurring', [{ id: 'r1', recurringDay: 1 }]);
    await markFullCheck('movements', 'u1');

    await useMovementStore.getState().loadData();
    expect(ids(useMovementStore.getState().recurringMovements)).toEqual(['r1']);

    await otro.guarda(PERSONAL_MOVS, mov('a', 5));
    await useMovementStore.getState().loadData();
    expect(useMovementStore.getState().recurringMovements).toEqual([]);
  });

  it('sin conexión no pide nada a la nube', async () => {
    await setLocal('@moflo_movements', [mov('a', 5)]);
    mockDb.connected = false;
    await useMovementStore.getState().loadData();
    expect(mockDb.reads).toEqual([]);
    expect(ids(useMovementStore.getState().movements)).toEqual(['a']);
  });

  it('lo que se guarda desde aquí sube con la hora del servidor y no se duplica al volver', async () => {
    await useMovementStore.getState().loadData();
    await useMovementStore.getState().addMovement(mov('aqui', 0));
    expect(typeof (nube(PERSONAL_MOVS).aqui.updatedAt as { toMillis?: unknown }).toMillis).toBe('function');
    await useMovementStore.getState().loadData();
    const list = useMovementStore.getState().movements;
    expect(list.map((m) => m.id)).toEqual(['aqui']);
    expect(typeof list[0].updatedAt).toBe('number');

    // Al editar, la hora del móvil no sube: la pone el servidor
    await useMovementStore.getState().updateMovement('aqui', { amount: 3, updatedAt: 1 });
    expect((nube(PERSONAL_MOVS).aqui.updatedAt as { toMillis: () => number }).toMillis()).toBe(mockDb.clock);
    expect(nube(PERSONAL_MOVS).aqui.amount).toBe(3);
  });

  it('una edición de aquí que aún no ha subido no la pisa lo que vuelve de la nube', async () => {
    await otro.guarda(PERSONAL_MOVS, mov('x', 5));
    await useMovementStore.getState().loadData();
    const [x] = await getLocal('@moflo_movements');
    // Editado aquí sin conexión: en la copia, con la hora que tenía
    await setLocal('@moflo_movements', [{ ...x, amount: 50 }]);
    await useMovementStore.getState().loadData();
    expect(useMovementStore.getState().movements[0].amount).toBe(50);
  });

  it('borrar desde aquí deja el apunte, y el otro móvil lo quita al abrir', async () => {
    await otro.guarda(PERSONAL_MOVS, mov('x', 5));
    await otro.guarda(PERSONAL_MOVS, mov('y', 5));
    await useMovementStore.getState().loadData();
    const otroMovil = await guardarMovil();

    await useMovementStore.getState().deleteMovement('x');
    expect(nube(PERSONAL_MOVS).x).toBeUndefined();
    const apunte = nube(PERSONAL_DELETED).x;
    expect(Object.keys(apunte).sort()).toEqual(['expireAt', 'updatedAt']);
    const expira = (apunte.expireAt as { toMillis: () => number }).toMillis() - Date.now();
    expect(expira).toBeGreaterThan(29 * DAY);
    expect(expira).toBeLessThanOrEqual(30 * DAY);

    await ponerMovil(otroMovil);
    await useMovementStore.getState().loadData();
    expect(ids(useMovementStore.getState().movements)).toEqual(['y']);
  });

  it('si las reglas aún no dejan leer los apuntes, lo cambiado llega igual (lo borrado, con la comprobación)', async () => {
    await otro.guarda(PERSONAL_MOVS, mov('a', 5));
    await otro.guarda(PERSONAL_MOVS, mov('b', 5));
    await useMovementStore.getState().loadData();
    await otro.guarda(PERSONAL_MOVS, mov('c', 0));
    await otro.borra(null, 'movements', 'b');
    await otro.guarda(PERSONAL_RECURRING, RECURRING);
    mockDb.denyRead = [/deletedMovements/];
    await useMovementStore.getState().loadData();
    expect(ids(useMovementStore.getState().movements)).toEqual(['a', 'b', 'c']);
    expect(ids(useMovementStore.getState().recurringMovements)).toEqual(['r1']);
    await useMovementStore.getState().loadData({ fullCheck: true });
    expect(ids(useMovementStore.getState().movements)).toEqual(['a', 'c']);
  });

  it('si las reglas aún no dejan guardar el apunte, se borra igual y se avisa', async () => {
    await otro.guarda(PERSONAL_MOVS, mov('x', 5));
    await useMovementStore.getState().loadData();
    mockDb.deny = [/deletedMovements/];
    await useMovementStore.getState().deleteMovement('x');
    expect(nube(PERSONAL_MOVS).x).toBeUndefined();
    expect(nube(PERSONAL_DELETED).x).toBeUndefined();
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});

describe('cuenta compartida (loadSharedData)', () => {
  const cacheKey = sharedCacheKey(SHARED_CACHE.MOVEMENTS, 'S1');

  it('sin copia baja todo, de lo más nuevo a lo más viejo, y apunta la comprobación', async () => {
    await otro.guarda(SHARED_MOVS, mov('viejo', 100));
    await otro.guarda(SHARED_MOVS, mov('nuevo', 1));
    await otro.guarda(SHARED_MOVS, mov('medio', 40));
    await useMovementStore.getState().loadSharedData('S1');
    expect(useMovementStore.getState().movements.map((m) => m.id)).toEqual(['nuevo', 'medio', 'viejo']);
    expect(readsOf(SHARED_MOVS)).toEqual([{ path: SHARED_MOVS, filter: undefined, limit: undefined, count: 3 }]);
    expect(await isFullCheckDue('movements', 'S1')).toBe(false);
  });

  it('con copia baja solo lo cambiado: también lo de hace meses, lo atrasado y lo borrado', async () => {
    await otro.guarda(SHARED_MOVS, mov('viejo', 60));
    await otro.guarda(SHARED_MOVS, mov('editado', 5));
    await otro.guarda(SHARED_MOVS, mov('borrado', 3));
    await useMovementStore.getState().loadSharedData('S1');

    await otro.guarda(SHARED_MOVS, mov('viejo', 60, { amount: 999 }));
    await otro.guarda(SHARED_MOVS, mov('editado', 5, { amount: 20 }));
    await otro.guarda(SHARED_MOVS, mov('nuevo', 1));
    // Un gasto de hace 3 meses que alguien apunta hoy
    await otro.guarda(SHARED_MOVS, mov('atrasado', 0, { date: ago(90) }));
    await otro.borra('S1', 'movements', 'borrado');
    mockDb.reads = [];
    await useMovementStore.getState().loadSharedData('S1');

    expect(readsOf(SHARED_MOVS)).toEqual([{ path: SHARED_MOVS, filter: 'updatedAt', limit: undefined, count: 4 }]);
    expect(readsOf(SHARED_DELETED)).toEqual([{ path: SHARED_DELETED, filter: 'updatedAt', limit: undefined, count: 1 }]);
    const byId = Object.fromEntries(useMovementStore.getState().movements.map((m) => [m.id, m]));
    expect(Object.keys(byId).sort()).toEqual(['atrasado', 'editado', 'nuevo', 'viejo']);
    expect(byId.editado.amount).toBe(20);
    expect(byId.viejo.amount).toBe(999);
    expect(ids(await getLocal(cacheKey))).toEqual(['atrasado', 'editado', 'nuevo', 'viejo']);
  });

  it('si lo cambiado viene de la caché de Firestore, no se toca nada', async () => {
    await otro.guarda(SHARED_MOVS, mov('a', 3));
    await useMovementStore.getState().loadSharedData('S1');
    await otro.guarda(SHARED_MOVS, mov('nuevo', 1));
    await otro.borra('S1', 'movements', 'a');
    mockDb.fromCache = true;
    await useMovementStore.getState().loadSharedData('S1');
    expect(ids(useMovementStore.getState().movements)).toEqual(['a']);
  });

  it('a los 14 días la baja entera, también lo que cambió una versión anterior', async () => {
    await otro.guarda(SHARED_MOVS, mov('viejo', 60));
    await useMovementStore.getState().loadSharedData('S1');
    await viejo.guarda(SHARED_MOVS, mov('viejo', 60, { amount: 999 }));
    await useMovementStore.getState().loadSharedData('S1');
    expect(useMovementStore.getState().movements[0].amount).toBe(10);

    await markFullCheck('movements', 'S1', Date.now() - FULL_CHECK_EVERY_MS - DAY);
    mockDb.reads = [];
    await useMovementStore.getState().loadSharedData('S1');
    expect(readsOf(SHARED_MOVS)[0].filter).toBeUndefined();
    expect(useMovementStore.getState().movements[0].amount).toBe(999);
  });

  it('la escucha solo junta lo cambiado con la copia de su misma cuenta', async () => {
    await setLocal('@moflo_movements', [mov('personal', 2)]);
    await markFullCheck('movements', 'u1');
    await useMovementStore.getState().loadData();
    // Entrando en la compartida: ya es la cuenta activa, pero aún con los movimientos de la individual
    useMovementStore.getState().setSharedAccountId('S1');
    expect(await useMovementStore.getState().applySharedChanges('S1', [mov('compartido', 1)], [])).toBe(false);
    expect(ids(useMovementStore.getState().movements)).toEqual(['personal']);

    await setLocal(cacheKey, [mov('viejo', 60)]);
    await markFullCheck('movements', 'S1');
    await useMovementStore.getState().loadSharedData('S1');
    expect(await useMovementStore.getState().applySharedChanges('S1', [mov('compartido', 1)], [{ id: 'viejo' }])).toBe(true);
    expect(ids(useMovementStore.getState().movements)).toEqual(['compartido']);
    expect(ids(await getLocal(cacheKey))).toEqual(['compartido']);
  });

  it('en directo: lo que hace otro miembro llega al momento, y después la marca', async () => {
    await otro.guarda(SHARED_MOVS, mov('a', 60));
    await otro.guarda(SHARED_MOVS, mov('b', 2));
    await useMovementStore.getState().loadSharedData('S1');
    const stop = listenToCloudChanges<Movement>('S1', 'movements',
      (changed, deleted) => useMovementStore.getState().applySharedChanges('S1', changed, deleted), () => {});
    await settle();

    await otro.guarda(SHARED_MOVS, mov('a', 60, { amount: 5 }));
    await otro.guarda(SHARED_MOVS, mov('c', 0));
    await otro.borra('S1', 'movements', 'b');
    await settle();
    const byId = Object.fromEntries(useMovementStore.getState().movements.map((m) => [m.id, m]));
    expect(Object.keys(byId).sort()).toEqual(['a', 'c']);
    expect(byId.a.amount).toBe(5);
    expect(ids(await getLocal(cacheKey))).toEqual(['a', 'c']);
    expect(await readMark('deletedMovements', 'S1')).toBe(mockDb.clock);

    // Al dejar de escuchar no llega nada más
    stop();
    await otro.guarda(SHARED_MOVS, mov('d', 0));
    await settle();
    expect(ids(useMovementStore.getState().movements)).toEqual(['a', 'c']);
  });

  it('en directo, si falla la escucha de los apuntes, lo cambiado sigue llegando; si falla la de lo cambiado, se cierran las dos', async () => {
    await otro.guarda(SHARED_MOVS, mov('a', 1));
    await useMovementStore.getState().loadSharedData('S1');
    mockDb.denyRead = [/deletedMovements/];
    const onError = jest.fn();
    listenToCloudChanges<Movement>('S1', 'movements',
      (changed, deleted) => useMovementStore.getState().applySharedChanges('S1', changed, deleted), onError);
    await settle();
    expect(reportError).toHaveBeenCalledTimes(1);
    await otro.guarda(SHARED_MOVS, mov('b', 0));
    await settle();
    expect(ids(useMovementStore.getState().movements)).toEqual(['a', 'b']);
    expect(onError).not.toHaveBeenCalled();

    // Ya no es miembro: falla también lo cambiado
    mockDb.denyRead = [/sharedAccounts\/S1/];
    await otro.guarda(SHARED_MOVS, mov('c', 0));
    await settle();
    expect(onError).toHaveBeenCalledTimes(1);
    mockDb.denyRead = [];
    await otro.guarda(SHARED_MOVS, mov('d', 0));
    await settle();
    expect(ids(useMovementStore.getState().movements)).toEqual(['a', 'b']);
  });

  it('en directo, lo borrado aquí sin conexión no vuelve cuando Firestore reenvía lo que había', async () => {
    await otro.guarda(SHARED_MOVS, mov('a', 1));
    await otro.guarda(SHARED_MOVS, mov('b', 1));
    await useMovementStore.getState().loadSharedData('S1');
    listenToCloudChanges<Movement>('S1', 'movements',
      (changed, deleted) => useMovementStore.getState().applySharedChanges('S1', changed, deleted), () => {});
    await settle();
    // Sin conexión: se quita en el móvil y el borrado espera en la cola
    mockDb.connected = false;
    await useMovementStore.getState().deleteMovement('b');
    expect(nube(SHARED_MOVS).b).toBeDefined();
    // Vuelve la red: llega lo de otro miembro (y Firestore avisa con todo lo que tiene)
    mockDb.connected = true;
    await otro.guarda(SHARED_MOVS, mov('c', 0));
    await settle();
    expect(ids(useMovementStore.getState().movements)).toEqual(['a', 'c']);
    // La cola sube el borrado
    await otro.borra('S1', 'movements', 'b');
    await settle();
    expect(ids(useMovementStore.getState().movements)).toEqual(['a', 'c']);
    expect(ids(await getLocal(cacheKey))).toEqual(['a', 'c']);
  });

  it('lo que salió de la nube antes de un borrado y llega después no lo devuelve', async () => {
    await otro.guarda(SHARED_MOVS, mov('a', 1));
    await otro.guarda(SHARED_MOVS, mov('b', 1));
    await useMovementStore.getState().loadSharedData('S1');
    const viejaB = useMovementStore.getState().movements.find((m) => m.id === 'b')!;
    await otro.borra('S1', 'movements', 'b');
    const apunte = { id: 'b', updatedAt: mockDb.clock };
    // El apunte llega por la escucha…
    await useMovementStore.getState().applySharedChanges('S1', [], [apunte]);
    expect(ids(useMovementStore.getState().movements)).toEqual(['a']);
    // …y después una respuesta que salió antes del borrado
    await useMovementStore.getState().applySharedChanges('S1', [viejaB], []);
    expect(ids(useMovementStore.getState().movements)).toEqual(['a']);
    // Lo mismo con una comprobación entera que lo leyó antes de borrarlo
    mockDb.docs[SHARED_MOVS].b = { ...viejaB, updatedAt: firestore.Timestamp.fromMillis(viejaB.updatedAt!) } as MockData;
    await useMovementStore.getState().loadSharedData('S1', { fullCheck: true });
    expect(ids(useMovementStore.getState().movements)).toEqual(['a']);
    // Si alguien lo vuelve a guardar después de borrarlo, sí vuelve
    await otro.guarda(SHARED_MOVS, mov('b', 1, { amount: 3 }));
    await useMovementStore.getState().loadSharedData('S1');
    expect(useMovementStore.getState().movements.find((m) => m.id === 'b')?.amount).toBe(3);
  });

  it('las escrituras de la compartida llevan la hora del servidor y el borrado deja el apunte', async () => {
    await useMovementStore.getState().loadSharedData('S1');
    await useMovementStore.getState().addMovement(mov('x', 0));
    expect(nube(SHARED_MOVS).x.addedBy).toBe('u1');
    expect(typeof (nube(SHARED_MOVS).x.updatedAt as { toMillis?: unknown }).toMillis).toBe('function');
    await useMovementStore.getState().updateMovement('x', { amount: 7 });
    expect(nube(SHARED_MOVS).x.amount).toBe(7);
    await useMovementStore.getState().deleteMovement('x');
    expect(nube(SHARED_MOVS).x).toBeUndefined();
    expect(Object.keys(nube(SHARED_DELETED).x).sort()).toEqual(['expireAt', 'updatedAt']);
  });
});

describe('movimientos de huchas (loadHuchaMovements)', () => {
  it('individual: al abrir pide solo lo cambiado', async () => {
    await otro.guarda(PERSONAL_HUCHA_MOVS, hm('a', 5));
    await useSavingsStore.getState().loadHuchaMovements(null);
    await otro.guarda(PERSONAL_HUCHA_MOVS, hm('b', 1));
    await otro.borra(null, 'huchaMovements', 'a');
    mockDb.reads = [];
    await useSavingsStore.getState().loadHuchaMovements(null);
    expect(ids(useSavingsStore.getState().huchaMovements)).toEqual(['b']);
    expect(readsOf(PERSONAL_HUCHA_MOVS)[0]).toEqual({ path: PERSONAL_HUCHA_MOVS, filter: 'updatedAt', limit: undefined, count: 1 });
    expect(readsOf(PERSONAL_HUCHA_DELETED)[0].count).toBe(1);
  });

  it('individual sin copia: entera', async () => {
    await otro.guarda(PERSONAL_HUCHA_MOVS, hm('a', 50));
    await viejo.guarda(PERSONAL_HUCHA_MOVS, hm('b', 1));
    await useSavingsStore.getState().loadHuchaMovements(null);
    expect(ids(useSavingsStore.getState().huchaMovements)).toEqual(['a', 'b']);
    expect(await isFullCheckDue('huchaMovements', 'u1')).toBe(false);
  });

  it('compartida: lo cambiado y lo borrado, junto con la copia', async () => {
    useSavingsStore.getState().setSharedAccountId('S1');
    await otro.guarda(SHARED_HUCHA_MOVS, hm('viejo', 60));
    await otro.guarda(SHARED_HUCHA_MOVS, hm('borrado', 2));
    await useSavingsStore.getState().loadHuchaMovements('S1');
    await otro.guarda(SHARED_HUCHA_MOVS, hm('viejo', 60, { amount: 99 }));
    await otro.guarda(SHARED_HUCHA_MOVS, hm('nuevo', 1));
    await otro.borra('S1', 'huchaMovements', 'borrado');
    mockDb.reads = [];
    await useSavingsStore.getState().loadHuchaMovements('S1');
    expect(readsOf(SHARED_HUCHA_MOVS)[0].filter).toBe('updatedAt');
    const list = useSavingsStore.getState().huchaMovements;
    expect(list.map((m) => m.id)).toEqual(['nuevo', 'viejo']);
    expect(list[1].amount).toBe(99);
    expect(readsOf(SHARED_HUCHA_DELETED)[0].count).toBe(1);
  });

  it('en directo, la compartida: lo de otro miembro llega al momento', async () => {
    useSavingsStore.getState().setSharedAccountId('S1');
    await otro.guarda(SHARED_HUCHA_MOVS, hm('a', 3));
    await useSavingsStore.getState().loadHuchaMovements('S1');
    const stop = listenToCloudChanges<HuchaMovement>('S1', 'huchaMovements',
      (changed, deleted) => useSavingsStore.getState().applySharedHuchaChanges('S1', changed, deleted), () => {});
    await settle();
    await otro.guarda(SHARED_HUCHA_MOVS, hm('b', 0));
    await otro.borra('S1', 'huchaMovements', 'a');
    await settle();
    expect(ids(useSavingsStore.getState().huchaMovements)).toEqual(['b']);
    expect(ids(await getLocal(sharedCacheKey(SHARED_CACHE.HUCHA_MOVEMENTS, 'S1')))).toEqual(['b']);
    stop();
  });

  it('aportar, corregir y borrar suben con la hora del servidor, y el borrado deja el apunte', async () => {
    await viejo.guarda('users/u1/huchas', { id: 'h1', name: 'Viaje', color: '#000', currentAmount: 0, targetAmount: 100, createdAt: ago(10) } as { id: string });
    await useSavingsStore.getState().loadHuchas();
    await useSavingsStore.getState().addToHucha('h1', 30);
    const [id] = Object.keys(nube(PERSONAL_HUCHA_MOVS));
    const hora = () => (nube(PERSONAL_HUCHA_MOVS)[id].updatedAt as { toMillis: () => number }).toMillis();
    expect(hora()).toBe(mockDb.clock);
    expect(nube('users/u1/huchas').h1.currentAmount).toBe(30);

    await useSavingsStore.getState().updateHuchaMovement(id, { amount: 20, type: 'deposit' });
    expect(hora()).toBe(mockDb.clock);
    expect(nube('users/u1/huchas').h1.currentAmount).toBe(20);

    await useSavingsStore.getState().deleteHuchaMovement(id);
    expect(nube(PERSONAL_HUCHA_MOVS)[id]).toBeUndefined();
    expect(Object.keys(nube(PERSONAL_HUCHA_DELETED)[id]).sort()).toEqual(['expireAt', 'updatedAt']);
    expect(nube('users/u1/huchas').h1.currentAmount).toBe(0);
  });

  it('si las reglas aún no dejan guardar el apunte, la aportación se borra igual y la hucha baja una vez', async () => {
    await viejo.guarda('users/u1/huchas', { id: 'h1', name: 'Viaje', color: '#000', currentAmount: 0, targetAmount: 100, createdAt: ago(10) } as { id: string });
    await useSavingsStore.getState().loadHuchas();
    await useSavingsStore.getState().addToHucha('h1', 30);
    const [id] = Object.keys(nube(PERSONAL_HUCHA_MOVS));
    mockDb.deny = [/deletedHuchaMovements/];
    await useSavingsStore.getState().deleteHuchaMovement(id);
    expect(nube(PERSONAL_HUCHA_MOVS)[id]).toBeUndefined();
    expect(nube('users/u1/huchas').h1.currentAmount).toBe(0);
  });

  it('las aportaciones automáticas también llevan la hora del servidor', async () => {
    const pasada = new Date(Date.now() - 2 * DAY).toISOString();
    await viejo.guarda('users/u1/huchas', {
      id: 'h1', name: 'Viaje', color: '#000', currentAmount: 0, targetAmount: 1000, createdAt: ago(40),
      isAutomatic: true, monthlyAmount: 50, recurringDay: new Date(pasada).getDate(), nextContributionDate: pasada,
    } as { id: string });
    await useSavingsStore.getState().loadHuchas();
    await useSavingsStore.getState().applyAutomaticContributions();
    const docs = Object.values(nube(PERSONAL_HUCHA_MOVS));
    expect(docs.length).toBeGreaterThan(0);
    docs.forEach((d) => expect(typeof (d.updatedAt as { toMillis?: unknown }).toMillis).toBe('function'));
  });
});

describe('aportaciones de huchas borradas en otro sitio', () => {
  const hmOf = (id: string, huchaId: string, days: number) => hm(id, days, { huchaId });
  const hucha = (id: string) => ({ id, name: id, createdAt: ago(100) });

  beforeEach(async () => {
    await setLocal('@moflo_hucha_movements', [hmOf('sigue', 'h1', 60), hmOf('huerfana', 'borrada', 60)]);
    await markFullCheck('huchaMovements', 'u1');
    await viejo.guarda('users/u1/huchas', hucha('h1'));
  });

  it('se quitan con la lista de huchas del servidor', async () => {
    await useSavingsStore.getState().loadHuchas();
    expect(ids(useSavingsStore.getState().huchaMovements)).toEqual(['sigue']);
    expect(ids(await getLocal('@moflo_hucha_movements'))).toEqual(['sigue']);
  });

  it('con la lista de la caché de Firestore, no (puede estar incompleta)', async () => {
    mockDb.fromCache = true;
    await useSavingsStore.getState().loadHuchas();
    expect(ids(useSavingsStore.getState().huchaMovements)).toEqual(['huerfana', 'sigue']);
  });

  it('solo sobre la copia de la misma cuenta', async () => {
    await useSavingsStore.getState().loadHuchaMovements(null);
    useSavingsStore.getState().dropOrphanHuchaMovements('S1', []);
    expect(ids(useSavingsStore.getState().huchaMovements)).toEqual(['huerfana', 'sigue']);
  });
});

describe('todas las escrituras de movimientos llevan la hora del servidor', () => {
  it('individual y compartida: crear, editar, borrar, fijos que se apuntan solos y huchas', async () => {
    const mes = new Date();
    const anterior = new Date(mes.getFullYear(), mes.getMonth() - 1, 1);
    const fijo = {
      id: 'f1', type: 'expense', amount: 9, category: 'bills', description: 'Luz', recurringDay: 1,
      currency: 'EUR', isActive: true, createdAt: ago(400),
      lastAppliedMonth: `${anterior.getFullYear()}-${String(anterior.getMonth() + 1).padStart(2, '0')}`,
    };
    // Individual
    await viejo.guarda(PERSONAL_RECURRING, fijo);
    await useMovementStore.getState().loadData();
    await useMovementStore.getState().applyRecurringMovements();
    await useMovementStore.getState().addMovement(mov('p1', 0));
    await useMovementStore.getState().updateMovement('p1', { amount: 2 });
    await useMovementStore.getState().addMovement(mov('p2', 0));
    await useMovementStore.getState().deleteMovement('p2');
    // Compartida
    await viejo.guarda('sharedAccounts/S1/recurring', fijo);
    await useMovementStore.getState().loadSharedData('S1');
    await useMovementStore.getState().applyRecurringMovements();
    await useMovementStore.getState().addMovement(mov('s1', 0));
    await useMovementStore.getState().updateMovement('s1', { amount: 2 });
    await useMovementStore.getState().addMovement(mov('s2', 0));
    await useMovementStore.getState().deleteMovement('s2');
    // Huchas de la compartida
    useSavingsStore.getState().setSharedAccountId('S1');
    await viejo.guarda('sharedAccounts/S1/huchas', { id: 'h1', name: 'Viaje', color: '#000', currentAmount: 0, targetAmount: 100, createdAt: ago(10) } as { id: string });
    await useSavingsStore.getState().loadSharedHuchas('S1');
    await useSavingsStore.getState().addToHucha('h1', 10);
    await useSavingsStore.getState().addToHucha('h1', 5);
    const [primera] = Object.keys(nube(SHARED_HUCHA_MOVS));
    await useSavingsStore.getState().updateHuchaMovement(primera, { amount: 8, type: 'deposit' });
    await useSavingsStore.getState().deleteHuchaMovement(primera);

    const conHora = (d: MockData) => typeof (d.updatedAt as { toMillis?: unknown })?.toMillis === 'function';
    for (const path of [PERSONAL_MOVS, SHARED_MOVS, SHARED_HUCHA_MOVS]) {
      const docs = Object.values(nube(path));
      expect(docs.length).toBeGreaterThan(0);
      docs.forEach((d) => expect(conHora(d)).toBe(true));
    }
    // Los fijos del mes, generados aquí
    expect(Object.keys(nube(PERSONAL_MOVS)).some((id) => id.startsWith('recurring_f1_'))).toBe(true);
    expect(Object.keys(nube(SHARED_MOVS)).some((id) => id.startsWith('recurring_f1_'))).toBe(true);
    for (const path of [PERSONAL_DELETED, SHARED_DELETED, SHARED_HUCHA_DELETED]) {
      const docs = Object.values(nube(path));
      expect(docs).toHaveLength(1);
      expect(Object.keys(docs[0]).sort()).toEqual(['expireAt', 'updatedAt']);
    }
  });
});

describe('lo automático tras dos meses sin abrir la app', () => {
  const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const monthStart = (back: number) => new Date(new Date().getFullYear(), new Date().getMonth() - back, 1, 12);
  // Los tres meses que tocan: hace dos, el pasado y este (día 1, ya pasado)
  const meses = [2, 1, 0].map(monthStart);
  const fijo = {
    id: 'f1', type: 'expense', amount: 9, category: 'bills', description: 'Luz', recurringDay: 1,
    currency: 'EUR', isActive: true, createdAt: ago(400), lastAppliedMonth: ym(monthStart(3)),
  };
  const idsFijo = meses.map((d) => `recurring_f1_${d.getMonth() + 1}_${d.getFullYear()}`).sort();
  const hucha = {
    id: 'h1', name: 'Viaje', color: '#000', icon: 'x', currentAmount: 0, targetAmount: 1000, createdAt: ago(100),
    isAutomatic: true, monthlyAmount: 50, recurringDay: 1, nextContributionDate: meses[0].toISOString(),
  };
  const conHora = (d: MockData) => typeof (d.updatedAt as { toMillis?: unknown })?.toMillis === 'function';

  it('individual: salen los fijos de los tres meses, una vez, y el otro móvil los ve', async () => {
    await viejo.guarda(PERSONAL_RECURRING, fijo);
    await otro.guarda(PERSONAL_MOVS, mov('a', 90));
    await useMovementStore.getState().loadData();
    const otroMovil = await guardarMovil();
    await useMovementStore.getState().applyRecurringMovements();
    expect(Object.keys(nube(PERSONAL_MOVS)).filter((id) => id.startsWith('recurring_')).sort()).toEqual(idsFijo);
    Object.values(nube(PERSONAL_MOVS)).forEach((d) => expect(conHora(d)).toBe(true));
    expect(nube(PERSONAL_RECURRING).f1.lastAppliedMonth).toBe(ym(meses[2]));
    // Al abrir otra vez no se repiten
    await useMovementStore.getState().loadData();
    await useMovementStore.getState().applyRecurringMovements();
    expect(Object.keys(nube(PERSONAL_MOVS))).toHaveLength(4);
    // El otro móvil, al abrir: los tres, y no los vuelve a generar
    await ponerMovil(otroMovil);
    await useMovementStore.getState().loadData();
    await useMovementStore.getState().applyRecurringMovements();
    expect(ids(useMovementStore.getState().movements)).toEqual(['a', ...idsFijo].sort());
    expect(Object.keys(nube(PERSONAL_MOVS))).toHaveLength(4);
  });

  it('compartida: los fijos salen una vez aunque los dos miembros abran la app, y llegan a los dos', async () => {
    await viejo.guarda('sharedAccounts/S1/recurring', fijo);
    await useMovementStore.getState().loadSharedData('S1');
    const bea = await guardarMovil();
    await useMovementStore.getState().applyRecurringMovements();
    expect(Object.keys(nube(SHARED_MOVS)).sort()).toEqual(idsFijo);
    Object.values(nube(SHARED_MOVS)).forEach((d) => expect(conHora(d)).toBe(true));
    // Bea abre después: le llegan y no los repite
    await ponerMovil(bea);
    await useMovementStore.getState().loadSharedData('S1');
    await useMovementStore.getState().applyRecurringMovements();
    expect(ids(useMovementStore.getState().movements)).toEqual(idsFijo);
    expect(Object.keys(nube(SHARED_MOVS))).toHaveLength(3);
  });

  it('individual: la hucha automática aporta los tres meses una vez y queda lista para el siguiente', async () => {
    await viejo.guarda('users/u1/huchas', hucha);
    await useSavingsStore.getState().loadHuchas();
    await useSavingsStore.getState().applyAutomaticContributions();
    const aportaciones = Object.values(nube(PERSONAL_HUCHA_MOVS));
    expect(aportaciones).toHaveLength(3);
    aportaciones.forEach((d) => expect(conHora(d)).toBe(true));
    expect(nube('users/u1/huchas').h1.currentAmount).toBe(150);
    expect(new Date(nube('users/u1/huchas').h1.nextContributionDate as string).getTime()).toBeGreaterThan(Date.now());
    await useSavingsStore.getState().loadHuchas();
    await useSavingsStore.getState().applyAutomaticContributions();
    expect(Object.keys(nube(PERSONAL_HUCHA_MOVS))).toHaveLength(3);
    expect(nube('users/u1/huchas').h1.currentAmount).toBe(150);
  });

  it('compartida: la hucha automática no se aporta dos veces aunque abran los dos a la vez', async () => {
    useSavingsStore.getState().setSharedAccountId('S1');
    await viejo.guarda('sharedAccounts/S1/huchas', hucha);
    await useSavingsStore.getState().loadSharedHuchas('S1');
    const bea = await guardarMovil();
    await useSavingsStore.getState().applyAutomaticContributions();
    // Bea, con lo que tenía antes de que llegara nada de esto
    await ponerMovil(bea);
    useSavingsStore.getState().setSharedAccountId('S1');
    useSavingsStore.setState({ huchas: [hucha as never], huchaMovements: [], huchaMovementsOf: 'S1' });
    await useSavingsStore.getState().applyAutomaticContributions();
    expect(Object.keys(nube(SHARED_HUCHA_MOVS))).toHaveLength(3);
    expect(nube('sharedAccounts/S1/huchas').h1.currentAmount).toBe(150);
    // Y al cargar, a Bea le quedan las tres
    await useSavingsStore.getState().loadSharedHuchas('S1');
    expect(useSavingsStore.getState().huchaMovements).toHaveLength(3);
  });
});

describe('checkCloudCopy', () => {
  beforeEach(async () => {
    await otro.guarda(PERSONAL_MOVS, mov('a', 5));
    await useMovementStore.getState().loadData();
    await useSavingsStore.getState().loadHuchaMovements(null);
    await markFullCheck('movements', 'u1', Date.now() - DAY);
    await markFullCheck('huchaMovements', 'u1', Date.now() - DAY);
    await viejo.guarda(PERSONAL_MOVS, mov('deLa204', 1));
    mockDb.reads = [];
  });

  it('baja entero lo de la cuenta activa y lo apunta', async () => {
    const started = Date.now();
    expect(await checkCloudCopy()).toBe('done');
    expect(readsOf(PERSONAL_MOVS)).toEqual([{ path: PERSONAL_MOVS, filter: undefined, limit: undefined, count: 2 }]);
    expect(readsOf(PERSONAL_HUCHA_MOVS)).toHaveLength(1);
    expect(ids(useMovementStore.getState().movements)).toEqual(['a', 'deLa204']);
    expect(await lastFullCheck('u1')).toBeGreaterThanOrEqual(started);
  });

  it('sin conexión no lo intenta, y con una respuesta de la caché no cuenta', async () => {
    mockDb.connected = false;
    expect(await checkCloudCopy()).toBe('offline');
    expect(mockDb.reads).toEqual([]);
    mockDb.connected = true;
    mockDb.fromCache = true;
    expect(await checkCloudCopy()).toBe('failed');
  });

  it('si se acaba de comprobar, no lo repite (exportar)', async () => {
    expect(await checkCloudCopy({ unlessCheckedWithinMs: 2 * DAY })).toBe('done');
    expect(mockDb.reads).toEqual([]);
  });
});
