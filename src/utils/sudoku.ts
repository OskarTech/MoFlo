/**
 * Sudoku: el generador y las comprobaciones.
 *
 * El tablero es una lista de 81 casillas, fila a fila, con 0 en las vacías.
 * Para generar uno se rellena una solución entera al azar y se le van quitando
 * números, de dos en dos y en simetría (la casilla y su opuesta por el centro),
 * mientras siga teniendo una única solución. El nivel decide cuántas pistas se
 * quedan: cuantas menos, más difícil.
 */

export type SudokuLevel = 'easy' | 'medium' | 'hard';
export const SUDOKU_LEVELS: SudokuLevel[] = ['easy', 'medium', 'hard'];

/** Pistas que se intentan dejar en cada nivel */
export const CLUES: Record<SudokuLevel, number> = { easy: 40, medium: 32, hard: 26 };

export interface SudokuPuzzle {
  level: SudokuLevel;
  /** Las pistas, con 0 donde hay que rellenar */
  puzzle: number[];
  solution: number[];
}

const CELLS = Array.from({ length: 81 }, (_, i) => i);
const ROW = CELLS.map((i) => Math.floor(i / 9));
const COL = CELLS.map((i) => i % 9);
const BOX = CELLS.map((i) => Math.floor(ROW[i] / 3) * 3 + Math.floor(COL[i] / 3));

/** Las 20 casillas que comparten fila, columna o cuadro con cada una */
export const PEERS: number[][] = CELLS.map((i) => CELLS.filter((j) =>
  j !== i && (ROW[j] === ROW[i] || COL[j] === COL[i] || BOX[j] === BOX[i])));

// Las cifras posibles de una casilla van en bits: el 1 en el bit 1... el 9 en el 9
const ALL_DIGITS = 0b1111111110;

const bitCount = (mask: number) => {
  let count = 0;
  for (let m = mask; m; m &= m - 1) count++;
  return count;
};

const shuffle = <T,>(list: T[], random: () => number): T[] => {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};

/**
 * Busca soluciones con vuelta atrás, siempre por la casilla vacía con menos
 * opciones, que es lo que lo hace rápido. Para al llegar a `limit` soluciones.
 * Con `random`, prueba las cifras en orden aleatorio (para generar).
 */
const search = (
  grid: number[],
  limit: number,
  random?: () => number,
): { count: number; first: number[] | null } => {
  const cells = grid.slice();
  const rows = new Array<number>(9).fill(0);
  const cols = new Array<number>(9).fill(0);
  const boxes = new Array<number>(9).fill(0);
  for (const i of CELLS) {
    const digit = cells[i];
    if (!digit) continue;
    const bit = 1 << digit;
    // Dos iguales en la misma fila, columna o cuadro: no tiene solución
    if ((rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]) & bit) return { count: 0, first: null };
    rows[ROW[i]] |= bit;
    cols[COL[i]] |= bit;
    boxes[BOX[i]] |= bit;
  }

  let count = 0;
  let first: number[] | null = null;
  const step = (): boolean => {
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (const i of CELLS) {
      if (cells[i]) continue;
      const mask = ALL_DIGITS & ~(rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]);
      const options = bitCount(mask);
      // Una casilla sin ninguna cifra posible: por aquí no hay solución
      if (options === 0) return false;
      if (options < bestCount) {
        best = i;
        bestMask = mask;
        bestCount = options;
      }
    }
    if (best === -1) {
      count++;
      if (!first) first = cells.slice();
      return count >= limit;
    }
    const digits: number[] = [];
    for (let digit = 1; digit <= 9; digit++) if (bestMask & (1 << digit)) digits.push(digit);
    if (random) shuffle(digits, random);
    const r = ROW[best];
    const c = COL[best];
    const b = BOX[best];
    for (const digit of digits) {
      const bit = 1 << digit;
      cells[best] = digit;
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[b] |= bit;
      if (step()) return true;
      cells[best] = 0;
      rows[r] &= ~bit;
      cols[c] &= ~bit;
      boxes[b] &= ~bit;
    }
    return false;
  };
  step();
  return { count, first };
};

/** Cuántas soluciones tiene, hasta `limit` (con 2 basta para saber si es única) */
export const countSolutions = (grid: number[], limit = 2): number => search(grid, limit).count;

/** Una solución, o null si no tiene */
export const solveSudoku = (grid: number[]): number[] | null => search(grid, 1).first;

const cluesOf = (puzzle: number[]) => puzzle.filter(Boolean).length;

const generateOnce = (level: SudokuLevel, random: () => number): SudokuPuzzle => {
  const solution = search(new Array<number>(81).fill(0), 1, random).first as number[];
  const puzzle = solution.slice();
  let clues = 81;
  // La casilla i y su opuesta 80 - i; la 40 (el centro) va sola
  for (const i of shuffle(CELLS.slice(0, 41), random)) {
    if (clues <= CLUES[level]) break;
    const pair = i === 40 ? [i] : [i, 80 - i];
    for (const k of pair) puzzle[k] = 0;
    if (countSolutions(puzzle) === 1) clues -= pair.length;
    else for (const k of pair) puzzle[k] = solution[k];
  }
  return { level, puzzle, solution };
};

// Hay soluciones de las que no se pueden quitar tantas pistas sin que deje de
// ser única: en difícil a veces se quedaba en 32, como uno medio. Se prueba
// con otras hasta acercarse a lo pedido y se queda el que menos tiene
const ATTEMPTS = 6;

/** Un sudoku nuevo del nivel pedido, con una única solución */
export const generateSudoku = (level: SudokuLevel, random: () => number = Math.random): SudokuPuzzle => {
  let best = generateOnce(level, random);
  for (let attempt = 1; attempt < ATTEMPTS && cluesOf(best.puzzle) > CLUES[level] + 2; attempt++) {
    const next = generateOnce(level, random);
    if (cluesOf(next.puzzle) < cluesOf(best.puzzle)) best = next;
  }
  return best;
};

/** Las casillas con un número repetido en su fila, su columna o su cuadro */
export const conflictsOf = (board: number[]): boolean[] =>
  board.map((digit, i) => digit !== 0 && PEERS[i].some((j) => board[j] === digit));

/** Las 81 cifras, para guardarlas como texto: "530070000..." */
export const toDigits = (cells: number[]) => cells.join('');
export const fromDigits = (text: string) => [...text].map(Number);
