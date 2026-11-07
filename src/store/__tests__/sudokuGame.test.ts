import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadSudokuGame, saveSudokuGame } from '../sudokuGame';
import { fromDigits, toDigits } from '../../utils/sudoku';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const PUZZLE = fromDigits('530070000600195000098000060800060003400803001700020006060000280000419005000080079');
const SOLUTION = fromDigits('534678912672195348198342567859761423426853791713924856961537284287419635345286179');
const entries = new Array<number>(81).fill(0);
entries[2] = 4; // la casilla 2 está vacía en el sudoku
entries[3] = 9; // aunque no sea el de la solución, se guarda tal cual
const GAME = { level: 'medium' as const, puzzle: PUZZLE, solution: SOLUTION, entries };

const saveRaw = (value: unknown) => AsyncStorage.setItem('@moflo_sudoku_ana', JSON.stringify(value));

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('la partida de sudoku guardada', () => {
  it('sin partida, nada', async () => {
    await expect(loadSudokuGame('ana')).resolves.toBeNull();
  });

  it('vuelve tal cual, con lo puesto', async () => {
    await saveSudokuGame('ana', GAME);
    await expect(loadSudokuGame('ana')).resolves.toEqual(GAME);
  });

  it('es de cada persona: otra cuenta en el mismo móvil no la ve', async () => {
    await saveSudokuGame('ana', GAME);
    await expect(loadSudokuGame('luis')).resolves.toBeNull();
  });

  it('lo roto o lo que no cuadra se descarta', async () => {
    const base = { level: 'medium', puzzle: toDigits(PUZZLE), solution: toDigits(SOLUTION), entries: toDigits(entries) };

    await AsyncStorage.setItem('@moflo_sudoku_ana', '{no es json');
    await expect(loadSudokuGame('ana')).resolves.toBeNull();

    await saveRaw({ ...base, level: 'imposible' });
    await expect(loadSudokuGame('ana')).resolves.toBeNull();

    await saveRaw({ ...base, entries: '123' });
    await expect(loadSudokuGame('ana')).resolves.toBeNull();

    // Una solución con repetidos
    await saveRaw({ ...base, solution: `11${toDigits(SOLUTION).slice(2)}` });
    await expect(loadSudokuGame('ana')).resolves.toBeNull();

    // Una pista que no es la de la solución
    await saveRaw({ ...base, puzzle: `9${toDigits(PUZZLE).slice(1)}` });
    await expect(loadSudokuGame('ana')).resolves.toBeNull();

    // Un número puesto encima de una pista
    await saveRaw({ ...base, entries: `1${toDigits(entries).slice(1)}` });
    await expect(loadSudokuGame('ana')).resolves.toBeNull();

    await saveRaw(null);
    await expect(loadSudokuGame('ana')).resolves.toBeNull();
  });
});
