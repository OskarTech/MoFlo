import fs from 'fs';
import path from 'path';
import en from '../../i18n/locales/en.json';
import es from '../../i18n/locales/es.json';
import pl from '../../i18n/locales/pl.json';
import fr from '../../i18n/locales/fr.json';
import pt from '../../i18n/locales/pt.json';
import itLocale from '../../i18n/locales/it.json';
import de from '../../i18n/locales/de.json';

// Los textos de la cuenta de empresa: los mismos en los 7 idiomas, con las
// cuatro formas de plural del polaco, y ninguno que el código use sin estar

type Tree = { [key: string]: string | Tree };
const flat = (tree: Tree, prefix = ''): Record<string, string> =>
  Object.entries(tree).reduce<Record<string, string>>((out, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'string' ? { ...out, [key]: v } : { ...out, ...flat(v, key) };
  }, {});

const PLURAL = /_(one|few|many|other)$/;
const base = (key: string) => key.replace(PLURAL, '');
const locales = { es, en, pl, fr, pt, it: itLocale, de } as Record<string, { business: Tree }>;
const keysOf = (lang: string) => flat(locales[lang].business, 'business');

// Los archivos de la empresa, y los que la enlazan con la app
const sourceFiles = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
  return /\.tsx?$/.test(entry.name) ? [full] : [];
});

describe('textos de la empresa', () => {
  const es = keysOf('es');
  const esBases = new Set(Object.keys(es).map(base));

  it.each(['en', 'pl', 'fr', 'pt', 'it', 'de'])('%s tiene las mismas claves que el español', (lang) => {
    const bases = new Set(Object.keys(keysOf(lang)).map(base));
    expect([...esBases].filter((k) => !bases.has(k))).toEqual([]);
    expect([...bases].filter((k) => !esBases.has(k))).toEqual([]);
  });

  it('cada plural tiene sus formas (y el polaco, las cuatro)', () => {
    const plurals = [...new Set(Object.keys(es).filter((k) => PLURAL.test(k)).map(base))];
    expect(plurals.length).toBeGreaterThan(5);
    for (const lang of Object.keys(locales)) {
      const keys = keysOf(lang);
      const forms = lang === 'pl' ? ['one', 'few', 'many', 'other'] : ['one', 'other'];
      for (const key of plurals) {
        for (const form of forms) expect([lang, `${key}_${form}`, keys[`${key}_${form}`] !== undefined]).toEqual([lang, `${key}_${form}`, true]);
      }
    }
  });

  it('ningún texto que use el código falta', () => {
    const root = path.join(__dirname, '..', '..');
    const files = [
      ...sourceFiles(path.join(root, 'business')),
      path.join(root, 'components', 'common', 'AccountSwitcher.tsx'),
    ];
    const used = new Set<string>();
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      for (const match of text.matchAll(/['`](business\.[A-Za-z0-9_.]+)['`]/g)) used.add(match[1]);
    }
    expect(used.size).toBeGreaterThan(300);
    expect([...used].filter((key) => !esBases.has(key) && !es[key])).toEqual([]);
  });
});
