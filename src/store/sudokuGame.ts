import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SUDOKU_LEVELS, SudokuLevel, conflictsOf, fromDigits, toDigits,
} from '../utils/sudoku';

/** La partida de sudoku: el sudoku y los números que ha puesto quien juega */
export interface SudokuGame {
  level: SudokuLevel;
  /** Las pistas, con 0 donde hay que rellenar */
  puzzle: number[];
  solution: number[];
  /** Los números puestos: 0 en las vacías y donde hay pista */
  entries: number[];
}

// Como lo de la calculadora de interés compuesto: solo en este móvil y con el
// id de quien juega. La partida sigue ahí al volver, hasta que se empieza otra
// o se reinicia
const keyOf = (uid: string) => `@moflo_sudoku_${uid}`;

const DIGITS = /^[0-9]{81}$/;

/** La partida a medias de esa persona, o null si no hay (o lo guardado no vale) */
export const loadSudokuGame = async (uid: string): Promise<SudokuGame | null> => {
  try {
    const raw = await AsyncStorage.getItem(keyOf(uid));
    if (!raw) return null;
    const saved = JSON.parse(raw) as Record<string, unknown> | null;
    const level = saved?.level as SudokuLevel;
    const texts = [saved?.puzzle, saved?.solution, saved?.entries];
    if (!SUDOKU_LEVELS.includes(level)) return null;
    if (!texts.every((text) => typeof text === 'string' && DIGITS.test(text))) return null;
    const [puzzle, solution, entries] = (texts as string[]).map(fromDigits);
    // Una solución entera y sin repetidos, las pistas sacadas de ella y nada
    // puesto encima de una pista: si no, se descarta y se empieza de cero
    const valid = solution.every(Boolean)
      && !conflictsOf(solution).some(Boolean)
      && puzzle.every((digit, i) => digit === 0 || digit === solution[i])
      && entries.every((digit, i) => digit === 0 || puzzle[i] === 0);
    return valid ? { level, puzzle, solution, entries } : null;
  } catch {
    return null;
  }
};

export const saveSudokuGame = async (uid: string, game: SudokuGame): Promise<void> => {
  await AsyncStorage.setItem(keyOf(uid), JSON.stringify({
    level: game.level,
    puzzle: toDigits(game.puzzle),
    solution: toDigits(game.solution),
    entries: toDigits(game.entries),
  }));
};
