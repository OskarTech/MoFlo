import fs from 'fs';
import path from 'path';
import en from '../locales/en.json';
import es from '../locales/es.json';
import pl from '../locales/pl.json';
import fr from '../locales/fr.json';
import pt from '../locales/pt.json';
import itLocale from '../locales/it.json';
import de from '../locales/de.json';
import { SUDOKU_LEVELS } from '../../utils/sudoku';

// Los textos de la calculadora de interés compuesto y del sudoku: los mismos
// en los 7 idiomas, con las cuatro formas de plural del polaco, las mismas
// variables, y ninguno que el código use sin estar

type Block = Record<string, string>;
const locales = { es, en, pl, fr, pt, it: itLocale, de } as unknown as Record<string, Record<string, Block>>;
const PLURAL = /_(one|few|many|other)$/;
const base = (key: string) => key.replace(PLURAL, '');
const root = path.join(__dirname, '..', '..');

const BLOCKS = [
  {
    block: 'compound',
    files: ['screens/app/CompoundInterestScreen.tsx', 'screens/app/SettingsScreen.tsx'],
    // Las que se montan con la clave de cada parte: t(`compound.${part.key}`)
    dynamic: ['contributed', 'interest', 'total'],
    plurals: ['finalIn'],
  },
  {
    block: 'sudoku',
    files: ['screens/app/SudokuScreen.tsx', 'components/sudoku/SudokuBoard.tsx', 'screens/app/SettingsScreen.tsx'],
    // Las de cada nivel: t(`sudoku.${level}`)
    dynamic: SUDOKU_LEVELS as string[],
    plurals: [] as string[],
  },
];

describe.each(BLOCKS)('textos de $block', ({ block, files, dynamic, plurals }) => {
  const textsOf = (lang: string) => locales[lang][block];
  const esBases = new Set(Object.keys(textsOf('es')).map(base));

  it.each(['en', 'pl', 'fr', 'pt', 'it', 'de'])('%s tiene las mismas claves que el español', (lang) => {
    const bases = new Set(Object.keys(textsOf(lang)).map(base));
    expect([...esBases].filter((k) => !bases.has(k))).toEqual([]);
    expect([...bases].filter((k) => !esBases.has(k))).toEqual([]);
  });

  it('cada plural tiene sus formas (y el polaco, las cuatro)', () => {
    expect([...new Set(Object.keys(textsOf('es')).filter((k) => PLURAL.test(k)).map(base))]).toEqual(plurals);
    for (const lang of Object.keys(locales)) {
      const forms = lang === 'pl' ? ['one', 'few', 'many', 'other'] : ['one', 'other'];
      for (const key of plurals) {
        for (const form of forms) {
          expect([lang, `${key}_${form}`, textsOf(lang)[`${key}_${form}`] !== undefined]).toEqual([lang, `${key}_${form}`, true]);
        }
      }
    }
  });

  it('las variables de cada texto son las mismas en todos los idiomas', () => {
    const vars = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    const esTexts = textsOf('es');
    for (const lang of Object.keys(locales)) {
      for (const [key, text] of Object.entries(textsOf(lang))) {
        const esText = esTexts[key] ?? esTexts[`${base(key)}_other`];
        expect([lang, key, vars(text)]).toEqual([lang, key, vars(esText)]);
      }
    }
  });

  it('ningún texto que use el código falta', () => {
    const used = new Set<string>(dynamic);
    const literal = new RegExp(`['\`]${block}\\.([A-Za-z0-9_]+)['\`]`, 'g');
    for (const file of files) {
      const text = fs.readFileSync(path.join(root, file), 'utf8');
      for (const match of text.matchAll(literal)) used.add(match[1]);
    }
    expect(used.size).toBeGreaterThan(10);
    expect([...used].filter((key) => !esBases.has(key))).toEqual([]);
  });
});
