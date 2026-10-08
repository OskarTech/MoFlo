import { mergeBizChanges } from '../cloud/sync';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@react-native-firebase/firestore', () => ({ __esModule: true, default: () => ({}) }));
jest.mock('@react-native-firebase/auth', () => ({ __esModule: true, default: () => ({ currentUser: null }) }));
jest.mock('../../services/crashReporting', () => ({ reportError: jest.fn() }));

// Cómo se junta en el móvil lo que llega de la nube (ver mergeBizChanges)

type Day = { id: string; updatedAt?: number; entries: Record<string, number> };

describe('juntar lo que llega de la nube', () => {
  it('lo del servidor gana a igual hora: la caja que otro socio guardó a la vez no se pierde', () => {
    // Apuntada sin conexión, aún sin hora del servidor
    const mine: Day = { id: 'd', entries: { mia: 100 } };
    // Al subirla, Firestore enseña primero el día solo con lo de este móvil
    const ack: Day = { id: 'd', updatedAt: 10, entries: { mia: 100 } };
    const afterAck = mergeBizChanges([mine], [ack], [], false);
    expect(afterAck).toEqual([ack]);
    // Y un momento después el del servidor, con la caja del otro y la misma hora
    const server: Day = { id: 'd', updatedAt: 10, entries: { mia: 100, otra: 70 } };
    expect(mergeBizChanges(afterAck, [server], [], true)).toEqual([server]);
  });

  it('de la caché, a igual hora, no cambia lo que ya está', () => {
    const server: Day = { id: 'd', updatedAt: 10, entries: { mia: 100, otra: 70 } };
    const stale: Day = { id: 'd', updatedAt: 10, entries: { mia: 100 } };
    const local = [server];
    expect(mergeBizChanges(local, [stale], [], false)).toBe(local);
  });

  it('si llega lo mismo, aunque con las claves en otro orden, no se vuelve a guardar', () => {
    const local: Day[] = [{ id: 'd', updatedAt: 10, entries: { a: 1, b: 2 } }];
    const same = { entries: { b: 2, a: 1 }, updatedAt: 10, id: 'd' } as Day;
    expect(mergeBizChanges(local, [same], [], true)).toBe(local);
  });

  it('lo más antiguo no gana nunca, tampoco del servidor', () => {
    const local: Day[] = [{ id: 'd', updatedAt: 20, entries: { a: 2 } }];
    expect(mergeBizChanges(local, [{ id: 'd', updatedAt: 10, entries: { a: 1 } }], [], true)).toBe(local);
  });

  it('lo borrado se quita salvo que se haya vuelto a guardar después', () => {
    const local: Day[] = [
      { id: 'viejo', updatedAt: 5, entries: {} },
      { id: 'nuevo', updatedAt: 30, entries: {} },
    ];
    const merged = mergeBizChanges(local, [], [{ id: 'viejo', updatedAt: 10 }, { id: 'nuevo', updatedAt: 20 }], true);
    expect(merged.map((d) => d.id)).toEqual(['nuevo']);
  });
});
