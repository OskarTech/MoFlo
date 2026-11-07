import {
  CLUES, PEERS, SUDOKU_LEVELS, conflictsOf, countSolutions, fromDigits, generateSudoku, solveSudoku, toDigits,
} from '../sudoku';

// Azar con semilla (mulberry32): los mismos sudokus en cada ejecución
const seeded = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Uno conocido, con su solución
const KNOWN = fromDigits(
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079',
);
const KNOWN_SOLUTION = fromDigits(
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179',
);

const isValidSolution = (grid: number[]) =>
  grid.every((digit) => digit >= 1 && digit <= 9) && conflictsOf(grid).every((c) => !c);

describe('el solucionador', () => {
  it('resuelve uno conocido y sabe que su solución es única', () => {
    expect(solveSudoku(KNOWN)).toEqual(KNOWN_SOLUTION);
    expect(countSolutions(KNOWN)).toBe(1);
  });

  it('cuenta más de una cuando no es única, y ninguna si hay dos iguales', () => {
    const open = KNOWN.slice();
    // Sin pistas en dos filas enteras ya no es única
    for (let i = 0; i < 18; i++) open[i] = 0;
    expect(countSolutions(open)).toBe(2);
    const broken = KNOWN.slice();
    broken[2] = 5; // ya hay un 5 en la fila
    expect(countSolutions(broken)).toBe(0);
    expect(solveSudoku(broken)).toBeNull();
  });
});

describe('el generador', () => {
  it.each(SUDOKU_LEVELS)('%s: solución válida, pistas de la solución y solución única', (level) => {
    for (let seed = 1; seed <= 5; seed++) {
      const { puzzle, solution } = generateSudoku(level, seeded(seed * 97));
      expect(isValidSolution(solution)).toBe(true);
      expect(puzzle.every((digit, i) => digit === 0 || digit === solution[i])).toBe(true);
      expect(countSolutions(puzzle)).toBe(1);
      expect(solveSudoku(puzzle)).toEqual(solution);
    }
  });

  it('cada nivel deja menos pistas que el anterior, cerca de lo pedido', () => {
    const average = (level: keyof typeof CLUES) => {
      let total = 0;
      for (let seed = 1; seed <= 8; seed++) {
        total += generateSudoku(level, seeded(seed * 31)).puzzle.filter(Boolean).length;
      }
      return total / 8;
    };
    const easy = average('easy');
    const medium = average('medium');
    const hard = average('hard');
    expect(easy).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThan(hard);
    // Se quitan de dos en dos: puede quedarse una por debajo de lo pedido
    expect(easy).toBeGreaterThanOrEqual(CLUES.easy - 1);
    expect(easy).toBeLessThanOrEqual(CLUES.easy + 1);
    expect(medium).toBeLessThanOrEqual(CLUES.medium + 2);
    expect(hard).toBeLessThanOrEqual(CLUES.hard + 3);
  });

  it('las pistas quedan en simetría por el centro', () => {
    const { puzzle } = generateSudoku('medium', seeded(7));
    expect(puzzle.every((digit, i) => (digit === 0) === (puzzle[80 - i] === 0))).toBe(true);
  });
});

describe('las comprobaciones', () => {
  it('cada casilla tiene 20 vecinas', () => {
    expect(PEERS.every((peers) => peers.length === 20)).toBe(true);
    expect(PEERS[0]).toContain(80 - 80 + 8); // la misma fila
    expect(PEERS[0]).toContain(72); // la misma columna
    expect(PEERS[0]).toContain(20); // el mismo cuadro
    expect(PEERS[0]).not.toContain(30);
  });

  it('marca los repetidos en fila, columna y cuadro, y nada más', () => {
    const board = new Array<number>(81).fill(0);
    board[0] = 4;
    board[5] = 4; // misma fila
    board[40] = 7; // solo
    expect(conflictsOf(board).map((c, i) => (c ? i : -1)).filter((i) => i >= 0)).toEqual([0, 5]);
    board[5] = 0;
    board[27] = 4; // misma columna
    board[10] = 4; // mismo cuadro
    expect(conflictsOf(board).map((c, i) => (c ? i : -1)).filter((i) => i >= 0)).toEqual([0, 10, 27]);
    expect(conflictsOf(KNOWN_SOLUTION).some(Boolean)).toBe(false);
  });

  it('pasa a texto y vuelve igual', () => {
    expect(fromDigits(toDigits(KNOWN))).toEqual(KNOWN);
    expect(toDigits(KNOWN)).toHaveLength(81);
  });
});
