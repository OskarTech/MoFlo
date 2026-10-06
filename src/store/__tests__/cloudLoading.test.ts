import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMovementStore } from '../movementStore';
import { useSavingsStore } from '../savingsStore';
import { checkCloudCopy } from '../checkCloudCopy';
import { FULL_CHECK_EVERY_MS, isFullCheckDue, lastFullCheck, markFullCheck, useCloudCheckStore } from '../cloudCheck';
import { sharedCacheKey, SHARED_CACHE } from '../sharedCache';
import { Movement } from '../../types';

// Firestore falsa en memoria: colecciones por ruta, el filtro ">=", orderBy y
// limit, y si las respuestas vienen del servidor o de la caché del móvil.
// Apunta cada lectura para ver qué se ha pedido a la nube
type Doc = { id: string };
const mockDb = {
  data: {} as Record<string, Doc[]>,
  reads: [] as { path: string; filter?: string; limit?: number }[],
  fromCache: false,
  connected: true,
};

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('@react-native-firebase/firestore', () => {
  const query = (path: string, filter?: [string, string], order?: [string, string], limit?: number): unknown => ({
    where: (field: string, op: string, value: string) => {
      if (op !== '>=') throw new Error(`Sin preparar para ${op}`);
      return query(path, [field, value], order, limit);
    },
    orderBy: (field: string, dir = 'asc') => query(path, filter, [field, dir], limit),
    limit: (n: number) => query(path, filter, order, n),
    get: async () => {
      mockDb.reads.push({ path, filter: filter?.[0], limit });
      let docs = [...(mockDb.data[path] ?? [])] as (Doc & Record<string, unknown>)[];
      if (filter) docs = docs.filter((d) => typeof d[filter[0]] === 'string' && (d[filter[0]] as string) >= filter[1]);
      if (order) {
        const [field, dir] = order;
        docs.sort((a, b) => String(a[field]).localeCompare(String(b[field])) * (dir === 'desc' ? -1 : 1));
      }
      if (limit != null) docs = docs.slice(0, limit);
      return {
        empty: docs.length === 0,
        docs: docs.map((d) => ({ id: d.id, data: () => ({ ...d }) })),
        metadata: { fromCache: mockDb.fromCache },
      };
    },
    doc: (id: string) => ({
      collection: (name: string) => query(`${path}/${id}/${name}`),
      update: async () => {},
      set: async () => {},
      delete: async () => {},
    }),
  });
  return { __esModule: true, default: () => ({ collection: (name: string) => query(name) }) };
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
const ids = (list: { id: string }[]) => list.map((m) => m.id).sort();
const readsOf = (path: string) => mockDb.reads.filter((r) => r.path === path);

const PERSONAL_MOVS = 'users/u1/movements';
const PERSONAL_RECURRING = 'users/u1/recurring';
const PERSONAL_HUCHA_MOVS = 'users/u1/huchaMovements';
const SHARED_MOVS = 'sharedAccounts/S1/movements';
const SHARED_HUCHA_MOVS = 'sharedAccounts/S1/huchaMovements';
const RECURRING = { id: 'r1', recurringDay: 1 } as Doc;

const setLocal = (key: string, value: unknown) => AsyncStorage.setItem(key, JSON.stringify(value));
const getLocal = async (key: string) => JSON.parse((await AsyncStorage.getItem(key)) ?? 'null');

beforeEach(async () => {
  await AsyncStorage.clear();
  mockDb.data = {};
  mockDb.reads = [];
  mockDb.fromCache = false;
  mockDb.connected = true;
  mockShared.isSharedMode = false;
  mockShared.sharedAccount = null;
  useMovementStore.getState().resetStore();
  useSavingsStore.getState().resetStore();
  useCloudCheckStore.setState({ checkedAt: {} });
});

describe('cuenta individual (loadData)', () => {
  it('sin copia en el móvil baja todo de la nube y apunta la comprobación', async () => {
    mockDb.data[PERSONAL_MOVS] = [mov('a', 5), mov('b', 100)];
    mockDb.data[PERSONAL_RECURRING] = [RECURRING];
    await useMovementStore.getState().loadData();
    expect(ids(useMovementStore.getState().movements)).toEqual(['a', 'b']);
    expect(ids(await getLocal('@moflo_movements'))).toEqual(['a', 'b']);
    expect(await isFullCheckDue('movements', 'u1')).toBe(false);
  });

  it('con copia y comprobada hace poco, no pide los movimientos a la nube (los fijos, sí)', async () => {
    await setLocal('@moflo_movements', [mov('a', 5)]);
    await markFullCheck('movements', 'u1', Date.now() - 3 * DAY);
    mockDb.data[PERSONAL_MOVS] = [mov('a', 5), mov('otroMovil', 1)];
    mockDb.data[PERSONAL_RECURRING] = [RECURRING];
    await useMovementStore.getState().loadData();
    expect(readsOf(PERSONAL_MOVS)).toEqual([]);
    expect(readsOf(PERSONAL_RECURRING)).toHaveLength(1);
    expect(ids(useMovementStore.getState().movements)).toEqual(['a']);
    expect(ids(useMovementStore.getState().recurringMovements)).toEqual(['r1']);
  });

  it('a los 14 días, o si se pide, la comprueba entera', async () => {
    await setLocal('@moflo_movements', [mov('a', 5)]);
    await markFullCheck('movements', 'u1', Date.now() - FULL_CHECK_EVERY_MS);
    mockDb.data[PERSONAL_MOVS] = [mov('a', 5), mov('otroMovil', 1)];
    await useMovementStore.getState().loadData();
    expect(ids(useMovementStore.getState().movements)).toEqual(['a', 'otroMovil']);

    mockDb.data[PERSONAL_MOVS].push(mov('otroMas', 0));
    await useMovementStore.getState().loadData();
    expect(ids(useMovementStore.getState().movements)).toEqual(['a', 'otroMovil']);
    await useMovementStore.getState().loadData({ fullCheck: true });
    expect(ids(useMovementStore.getState().movements)).toEqual(['a', 'otroMas', 'otroMovil']);
  });

  it('una respuesta de la caché de Firestore no toca la copia ni cuenta como comprobación', async () => {
    await setLocal('@moflo_movements', [mov('a', 5)]);
    mockDb.data[PERSONAL_MOVS] = [mov('b', 1)];
    mockDb.fromCache = true;
    await useMovementStore.getState().loadData();
    expect(ids(useMovementStore.getState().movements)).toEqual(['a']);
    expect(ids(await getLocal('@moflo_movements'))).toEqual(['a']);
    expect(await isFullCheckDue('movements', 'u1')).toBe(true);
  });

  it('con la nube vacía no se borra nada del móvil', async () => {
    await setLocal('@moflo_movements', [mov('a', 5)]);
    await setLocal('@moflo_recurring', [{ id: 'r1', recurringDay: 1 }]);
    await useMovementStore.getState().loadData();
    expect(ids(useMovementStore.getState().movements)).toEqual(['a']);
    expect(ids(useMovementStore.getState().recurringMovements)).toEqual(['r1']);
    expect(await isFullCheckDue('movements', 'u1')).toBe(false);
  });

  it('una cuenta sin nada guarda la copia vacía y no vuelve a bajarlo todo en el siguiente inicio', async () => {
    await useMovementStore.getState().loadData();
    expect(await getLocal('@moflo_movements')).toEqual([]);
    mockDb.reads = [];
    await useMovementStore.getState().loadData();
    expect(readsOf(PERSONAL_MOVS)).toEqual([]);
  });

  it('los fijos borrados en otro móvil se quitan, salvo con la nube vacía', async () => {
    await setLocal('@moflo_movements', [mov('a', 5)]);
    await setLocal('@moflo_recurring', [{ id: 'r1', recurringDay: 1 }]);
    await markFullCheck('movements', 'u1');

    await useMovementStore.getState().loadData();
    expect(ids(useMovementStore.getState().recurringMovements)).toEqual(['r1']);

    mockDb.data[PERSONAL_MOVS] = [mov('a', 5)];
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
});

describe('cuenta compartida (loadSharedData)', () => {
  const cacheKey = sharedCacheKey(SHARED_CACHE.MOVEMENTS, 'S1');

  it('sin copia baja todo, de lo más nuevo a lo más viejo, y apunta la comprobación', async () => {
    mockDb.data[SHARED_MOVS] = [mov('viejo', 100), mov('nuevo', 1), mov('medio', 40)];
    await useMovementStore.getState().loadSharedData('S1');
    expect(useMovementStore.getState().movements.map((m) => m.id)).toEqual(['nuevo', 'medio', 'viejo']);
    expect(readsOf(SHARED_MOVS)).toEqual([{ path: SHARED_MOVS, filter: undefined, limit: undefined }]);
    expect(await isFullCheckDue('movements', 'S1')).toBe(false);
  });

  it('con copia baja solo lo apuntado en los últimos 30 días y lo junta con ella', async () => {
    await setLocal(cacheKey, [mov('viejo', 60), mov('editado', 5), mov('borrado', 3)]);
    await markFullCheck('movements', 'S1');
    mockDb.data[SHARED_MOVS] = [
      mov('viejo', 60, { amount: 999 }),
      mov('editado', 5, { amount: 20 }),
      mov('nuevo', 1),
      // Un gasto de hace 3 meses que alguien apunta hoy
      mov('atrasado', 0, { date: ago(90) }),
    ];
    await useMovementStore.getState().loadSharedData('S1');

    expect(readsOf(SHARED_MOVS)).toEqual([{ path: SHARED_MOVS, filter: 'createdAt', limit: undefined }]);
    const byId = Object.fromEntries(useMovementStore.getState().movements.map((m) => [m.id, m]));
    expect(Object.keys(byId).sort()).toEqual(['atrasado', 'editado', 'nuevo', 'viejo']);
    expect(byId.editado.amount).toBe(20);
    // Lo de hace más de 30 días se queda como estaba hasta la comprobación entera
    expect(byId.viejo.amount).toBe(10);
    expect(ids(await getLocal(cacheKey))).toEqual(['atrasado', 'editado', 'nuevo', 'viejo']);
  });

  it('si lo reciente viene de la caché de Firestore, no se quita nada', async () => {
    await setLocal(cacheKey, [mov('borrado', 3)]);
    await markFullCheck('movements', 'S1');
    mockDb.data[SHARED_MOVS] = [mov('nuevo', 1)];
    mockDb.fromCache = true;
    await useMovementStore.getState().loadSharedData('S1');
    expect(ids(useMovementStore.getState().movements)).toEqual(['borrado', 'nuevo']);
  });

  it('a los 14 días la baja entera, también lo antiguo', async () => {
    await setLocal(cacheKey, [mov('viejo', 60)]);
    await markFullCheck('movements', 'S1', Date.now() - FULL_CHECK_EVERY_MS - DAY);
    mockDb.data[SHARED_MOVS] = [mov('viejo', 60, { amount: 999 })];
    await useMovementStore.getState().loadSharedData('S1');
    expect(readsOf(SHARED_MOVS)[0].filter).toBeUndefined();
    expect(useMovementStore.getState().movements[0].amount).toBe(999);
  });

  it('la escucha solo junta lo reciente con la copia de su misma cuenta', async () => {
    await setLocal('@moflo_movements', [mov('personal', 2)]);
    await markFullCheck('movements', 'u1');
    await useMovementStore.getState().loadData();
    // Entrando en la compartida: ya es la cuenta activa, pero aún con los movimientos de la individual
    useMovementStore.getState().setSharedAccountId('S1');
    useMovementStore.getState().mergeSharedRecent('S1', [mov('compartido', 1)], ago(30), true);
    expect(ids(useMovementStore.getState().movements)).toEqual(['personal']);

    await setLocal(cacheKey, [mov('viejo', 60)]);
    await markFullCheck('movements', 'S1');
    await useMovementStore.getState().loadSharedData('S1');
    useMovementStore.getState().mergeSharedRecent('S1', [mov('compartido', 1)], ago(30), true);
    expect(ids(useMovementStore.getState().movements)).toEqual(['compartido', 'viejo']);
    await new Promise((r) => setTimeout(r, 0));
    expect(ids(await getLocal(cacheKey))).toEqual(['compartido', 'viejo']);
  });
});

describe('movimientos de huchas (loadHuchaMovements)', () => {
  const hm = (id: string, days: number, extra: Record<string, unknown> = {}) =>
    ({ id, huchaId: 'h1', type: 'deposit', amount: 5, date: ago(days), createdAt: ago(days), ...extra });

  it('individual comprobada hace poco: no pide nada a la nube', async () => {
    await setLocal('@moflo_hucha_movements', [hm('a', 5)]);
    await markFullCheck('huchaMovements', 'u1');
    mockDb.data[PERSONAL_HUCHA_MOVS] = [hm('a', 5), hm('b', 1)];
    await useSavingsStore.getState().loadHuchaMovements(null);
    expect(mockDb.reads).toEqual([]);
    expect(ids(useSavingsStore.getState().huchaMovements)).toEqual(['a']);
  });

  it('individual sin copia: entera', async () => {
    mockDb.data[PERSONAL_HUCHA_MOVS] = [hm('a', 50), hm('b', 1)];
    await useSavingsStore.getState().loadHuchaMovements(null);
    expect(ids(useSavingsStore.getState().huchaMovements)).toEqual(['a', 'b']);
    expect(await isFullCheckDue('huchaMovements', 'u1')).toBe(false);
  });

  it('compartida: lo reciente, junto con la copia', async () => {
    useSavingsStore.getState().setSharedAccountId('S1');
    await setLocal(sharedCacheKey(SHARED_CACHE.HUCHA_MOVEMENTS, 'S1'), [hm('viejo', 60), hm('borrado', 2)]);
    await markFullCheck('huchaMovements', 'S1');
    mockDb.data[SHARED_HUCHA_MOVS] = [hm('viejo', 60, { amount: 99 }), hm('nuevo', 1)];
    await useSavingsStore.getState().loadHuchaMovements('S1');
    expect(readsOf(SHARED_HUCHA_MOVS)[0].filter).toBe('createdAt');
    const list = useSavingsStore.getState().huchaMovements;
    expect(list.map((m) => m.id)).toEqual(['nuevo', 'viejo']);
    expect(list[1].amount).toBe(5);
  });
});

describe('aportaciones de huchas borradas en otro sitio', () => {
  const hm = (id: string, huchaId: string, days: number) =>
    ({ id, huchaId, type: 'deposit', amount: 5, date: ago(days), createdAt: ago(days) });
  const hucha = (id: string) => ({ id, name: id, createdAt: ago(100) }) as Doc;

  beforeEach(async () => {
    await setLocal('@moflo_hucha_movements', [hm('sigue', 'h1', 60), hm('huerfana', 'borrada', 60)]);
    await markFullCheck('huchaMovements', 'u1');
    mockDb.data['users/u1/huchas'] = [hucha('h1')];
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

describe('checkCloudCopy', () => {
  beforeEach(async () => {
    await setLocal('@moflo_movements', [mov('a', 5)]);
    await setLocal('@moflo_hucha_movements', []);
    await markFullCheck('movements', 'u1', Date.now() - DAY);
    await markFullCheck('huchaMovements', 'u1', Date.now() - DAY);
    mockDb.data[PERSONAL_MOVS] = [mov('a', 5), mov('otroMovil', 1)];
  });

  it('baja entero lo de la cuenta activa y lo apunta', async () => {
    const started = Date.now();
    expect(await checkCloudCopy()).toBe('done');
    expect(readsOf(PERSONAL_MOVS)).toHaveLength(1);
    expect(readsOf(PERSONAL_HUCHA_MOVS)).toHaveLength(1);
    expect(ids(useMovementStore.getState().movements)).toEqual(['a', 'otroMovil']);
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
