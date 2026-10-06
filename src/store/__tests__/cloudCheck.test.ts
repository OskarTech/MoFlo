import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  FULL_CHECK_EVERY_MS, RECENT_DAYS, recentSince, mergeRecent, isFullCheckDue, markFullCheck,
  lastFullCheck, selectLastFullCheck, removeCloudChecks, useCloudCheckStore,
} from '../cloudCheck';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const DAY = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  await AsyncStorage.clear();
  useCloudCheckStore.setState({ checkedAt: {} });
});

describe('recentSince', () => {
  it('desde las 00:00 de hace 30 días, el mismo valor todo el día', () => {
    const morning = new Date(2026, 9, 6, 0, 5);
    const night = new Date(2026, 9, 6, 23, 55);
    expect(recentSince(morning)).toBe(new Date(2026, 9, 6 - RECENT_DAYS).toISOString());
    expect(recentSince(night)).toBe(recentSince(morning));
  });
});

describe('mergeRecent', () => {
  const since = '2026-09-06T00:00:00.000Z';
  const old = { id: 'old', createdAt: '2026-08-01T10:00:00.000Z', amount: 1 };
  const edited = { id: 'edited', createdAt: '2026-10-01T10:00:00.000Z', amount: 1 };
  const deleted = { id: 'deleted', createdAt: '2026-10-02T10:00:00.000Z', amount: 1 };
  const legacy = { id: 'legacy', amount: 1 };
  const local = [old, edited, deleted, legacy];

  it('lo que llega sustituye a lo del móvil; lo anterior se queda; lo reciente que falta se ha borrado', () => {
    const fresh = { id: 'fresh', createdAt: '2026-10-05T10:00:00.000Z', amount: 3 };
    const merged = mergeRecent(local, [{ ...edited, amount: 2 }, fresh], since, true);
    expect(merged).toEqual([{ ...edited, amount: 2 }, fresh, old, legacy]);
  });

  it('con la respuesta de la caché de Firestore no se quita nada (puede estar incompleta)', () => {
    const merged = mergeRecent(local, [{ ...edited, amount: 2 }], since, false);
    expect(merged.map((d) => d.id)).toEqual(['edited', 'old', 'deleted', 'legacy']);
    expect(merged[0].amount).toBe(2);
  });
});

describe('comprobación entera', () => {
  it('toca si nunca se ha hecho, a los 14 días o si el reloj ha ido hacia atrás', async () => {
    const now = Date.now();
    expect(await isFullCheckDue('movements', 'u1', now)).toBe(true);
    await markFullCheck('movements', 'u1', now - FULL_CHECK_EVERY_MS + DAY);
    expect(await isFullCheckDue('movements', 'u1', now)).toBe(false);
    await markFullCheck('movements', 'u1', now - FULL_CHECK_EVERY_MS);
    expect(await isFullCheckDue('movements', 'u1', now)).toBe(true);
    await markFullCheck('movements', 'u1', now + 2 * DAY);
    expect(await isFullCheckDue('movements', 'u1', now)).toBe(true);
  });

  it('cada cuenta y cada colección van por separado', async () => {
    await markFullCheck('movements', 'u1');
    expect(await isFullCheckDue('movements', 'u1')).toBe(false);
    expect(await isFullCheckDue('huchaMovements', 'u1')).toBe(true);
    expect(await isFullCheckDue('movements', 'shared_1')).toBe(true);
  });

  it('la última, la más antigua de las dos colecciones; sin alguna, ninguna', async () => {
    await markFullCheck('movements', 'u1', 2000);
    expect(await lastFullCheck('u1')).toBeNull();
    expect(selectLastFullCheck(useCloudCheckStore.getState().checkedAt, 'u1')).toBeNull();
    await markFullCheck('huchaMovements', 'u1', 1000);
    expect(await lastFullCheck('u1')).toBe(1000);
    expect(selectLastFullCheck(useCloudCheckStore.getState().checkedAt, 'u1')).toBe(1000);
  });

  it('al cerrar sesión se borran todas y nada más', async () => {
    await markFullCheck('movements', 'u1');
    await markFullCheck('huchaMovements', 'shared_1');
    await AsyncStorage.setItem('@moflo_movements', '[]');
    await removeCloudChecks();
    expect(await AsyncStorage.getAllKeys()).toEqual(['@moflo_movements']);
    expect(useCloudCheckStore.getState().checkedAt).toEqual({});
  });
});
