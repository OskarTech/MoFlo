import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  FULL_CHECK_EVERY_MS, SYNC_MARGIN_MS, isFullCheckDue, markFullCheck, lastFullCheck, selectLastFullCheck,
  removeCloudChecks, useCloudCheckStore, readMark, advanceMark, changesSince, latestUpdate, mergeChanges,
  advanceMarks, advanceMarksAfterFullRead, graveyardOf, withoutBuried,
} from '../cloudCheck';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const DAY = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  await AsyncStorage.clear();
  useCloudCheckStore.setState({ checkedAt: {} });
});

describe('marca', () => {
  it('sube y nunca baja; cada colección y cada cuenta por separado', async () => {
    expect(await readMark('movements', 'u1')).toBeNull();
    await advanceMark('movements', 'u1', 5000);
    await advanceMark('movements', 'u1', 3000);
    await advanceMark('movements', 'u1', null);
    expect(await readMark('movements', 'u1')).toBe(5000);
    expect(await readMark('deletedMovements', 'u1')).toBeNull();
    expect(await readMark('movements', 'shared_1')).toBeNull();
  });

  it('se piden los cambios desde unos minutos antes de la marca, o todos', () => {
    expect(changesSince(null)).toBe(0);
    expect(changesSince(SYNC_MARGIN_MS + 1000)).toBe(1000);
    expect(changesSince(1000)).toBe(0);
  });

  it('tras juntar cambios: la hora más reciente de lo cambiado y la de lo borrado', async () => {
    await advanceMarks('huchaMovements', 'u1', [{ id: 'a', updatedAt: 10 }, { id: 'b' }, { id: 'c', updatedAt: 30 }], []);
    expect(await readMark('huchaMovements', 'u1')).toBe(30);
    expect(await readMark('deletedHuchaMovements', 'u1')).toBeNull();
    await advanceMarks('huchaMovements', 'u1', [], [{ id: 'x', updatedAt: 20 }]);
    expect(await readMark('deletedHuchaMovements', 'u1')).toBe(20);
  });

  it('tras bajarla entera, las dos marcas de esa colección llegan a lo más reciente', async () => {
    await advanceMarksAfterFullRead('movements', 'u1', [{ id: 'a', updatedAt: 40 }, { id: 'viejo' }]);
    expect(await readMark('movements', 'u1')).toBe(40);
    expect(await readMark('deletedMovements', 'u1')).toBe(40);
    expect(await readMark('deletedHuchaMovements', 'u1')).toBeNull();
  });

  it('latestUpdate: la más reciente, o null si ninguno la tiene', () => {
    expect(latestUpdate([{ id: 'a', updatedAt: 3 }, { id: 'b', updatedAt: 7 }, { id: 'c' }])).toBe(7);
    expect(latestUpdate([{ id: 'c' }])).toBeNull();
    expect(latestUpdate([])).toBeNull();
  });
});

describe('mergeChanges', () => {
  type Doc = { id: string; updatedAt?: number; amount: number };
  const doc = (id: string, updatedAt: number | undefined, amount = 1): Doc =>
    (updatedAt == null ? { id, amount } : { id, updatedAt, amount });

  it('lo que llega sustituye a lo del móvil, y lo nuevo se añade', () => {
    const local = [doc('a', 10), doc('b', 10)];
    const merged = mergeChanges(local, [doc('a', 20, 2), doc('nuevo', 25)], []);
    expect(merged).toEqual([doc('a', 20, 2), doc('b', 10), doc('nuevo', 25)]);
  });

  it('no pisa lo del móvil si es igual o más nuevo (una edición de aquí que aún no ha subido)', () => {
    const editadoAqui = doc('a', 10, 99);
    const local = [editadoAqui, doc('b', 30, 5)];
    const merged = mergeChanges(local, [doc('a', 10, 1), doc('b', 20, 1)], []);
    expect(merged).toBe(local);
  });

  it('lo que aún no tiene hora (sin subir, o de antes de la 2.0.5) cuenta como lo más nuevo', () => {
    expect(mergeChanges([doc('a', 10)], [doc('a', undefined, 7)], [])).toEqual([doc('a', undefined, 7)]);
    expect(mergeChanges([doc('a', undefined)], [doc('a', 5, 7)], [])).toEqual([doc('a', 5, 7)]);
  });

  it('lo borrado se quita, salvo que se haya vuelto a guardar después de borrarlo', () => {
    const local = [doc('borrado', 10), doc('vuelto', 50), doc('sinHora', undefined), doc('sigue', 10)];
    const merged = mergeChanges(local, [], [
      { id: 'borrado', updatedAt: 20 }, { id: 'vuelto', updatedAt: 40 }, { id: 'sinHora', updatedAt: 1 }, { id: 'noEsta', updatedAt: 9 },
    ]);
    expect(merged.map((d) => d.id)).toEqual(['vuelto', 'sigue']);
  });

  it('borrado y vuelto a guardar a la vez: gana lo más reciente', () => {
    expect(mergeChanges([], [doc('x', 30)], [{ id: 'x', updatedAt: 20 }]).map((d) => d.id)).toEqual(['x']);
    expect(mergeChanges([doc('x', 10)], [doc('x', 20)], [{ id: 'x', updatedAt: 30 }])).toEqual([]);
  });

  it('el apunte de un borrado propio que aún no ha subido también quita', () => {
    expect(mergeChanges([doc('a', 10)], [], [{ id: 'a' }])).toEqual([]);
  });

  it('con el registro de borrados: lo que salió antes de un borrado no vuelve, lo guardado después sí', () => {
    const graveyard = new Map<string, number>();
    expect(mergeChanges([doc('x', 10)], [], [{ id: 'x', updatedAt: 20 }], graveyard)).toEqual([]);
    expect(graveyard.get('x')).toBe(20);
    expect(mergeChanges([], [doc('x', 10)], [], graveyard)).toEqual([]);
    expect(mergeChanges([], [doc('x', 20)], [], graveyard)).toEqual([]);
    expect(mergeChanges([], [doc('x', 25, 4)], [], graveyard)).toEqual([doc('x', 25, 4)]);
    // Un cambio propio que aún no ha subido (sin hora) sí entra
    expect(mergeChanges([], [doc('x', undefined, 5)], [], graveyard)).toEqual([doc('x', undefined, 5)]);
    // Un apunte más viejo no rebaja el registro
    mergeChanges([], [], [{ id: 'x', updatedAt: 15 }], graveyard);
    expect(graveyard.get('x')).toBe(20);
  });

  it('lo bajado entero, sin lo que se borró después de leerlo (también lo de antes de la 2.0.5)', () => {
    const graveyard = new Map([['x', 20], ['y', 20]]);
    const docs = [doc('x', 10), doc('y', undefined), doc('z', 5), doc('w', 30)];
    expect(withoutBuried(docs, graveyard).map((d) => d.id)).toEqual(['z', 'w']);
    expect(withoutBuried([doc('x', 25)], graveyard).map((d) => d.id)).toEqual(['x']);
  });

  it('cada colección y cada cuenta tienen su registro, y al cerrar sesión se olvidan', async () => {
    graveyardOf('movements', 'u1').set('x', 1);
    expect(graveyardOf('movements', 'u1').get('x')).toBe(1);
    expect(graveyardOf('huchaMovements', 'u1').size).toBe(0);
    expect(graveyardOf('movements', 'S1').size).toBe(0);
    await removeCloudChecks();
    expect(graveyardOf('movements', 'u1').size).toBe(0);
  });

  it('si no cambia nada devuelve la misma lista', () => {
    const local = [doc('a', 10)];
    expect(mergeChanges(local, [], [])).toBe(local);
    expect(mergeChanges(local, [doc('a', 10)], [{ id: 'otro', updatedAt: 5 }])).toBe(local);
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

  it('al cerrar sesión se borran todas, con las marcas, y nada más', async () => {
    await markFullCheck('movements', 'u1');
    await markFullCheck('huchaMovements', 'shared_1');
    await advanceMark('deletedMovements', 'u1', 100);
    await AsyncStorage.setItem('@moflo_movements', '[]');
    await removeCloudChecks();
    expect(await AsyncStorage.getAllKeys()).toEqual(['@moflo_movements']);
    expect(useCloudCheckStore.getState().checkedAt).toEqual({});
  });
});
