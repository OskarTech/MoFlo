import { BASE_CATEGORIES } from '../categories';
import { CATEGORY_ICONS } from '../categoryIcons';
import { HUCHA_ICONS } from '../huchaIcons';
import { IONICON_TO_PHOSPHOR, PHOSPHOR } from '../../components/common/icons/phosphor.generated';
import ioniconsGlyphs from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json';

// Lo que puede acabar guardado en Firestore: el icono de las categorías base y
// propias (se pintan en su versión "-outline") y el de las huchas
const storedNames = [
  ...BASE_CATEGORIES.map((c) => `${c.icon}-outline`),
  ...CATEGORY_ICONS.map((icon) => `${icon}-outline`),
  ...HUCHA_ICONS,
];

describe('iconos', () => {
  it('todo icono que se puede guardar tiene su dibujo de Phosphor', () => {
    const missing = storedNames.filter((name) => !IONICON_TO_PHOSPHOR[name]);
    expect(missing).toEqual([]);
  });

  it('lo que se guarda sigue siendo un nombre de Ionicons (las versiones anteriores de la app solo entienden esos)', () => {
    const glyphs = ioniconsGlyphs as Record<string, number>;
    const unknown = [
      ...BASE_CATEGORIES.map((c) => c.icon),
      ...CATEGORY_ICONS,
      ...HUCHA_ICONS,
    ].filter((name) => glyphs[name] === undefined);
    expect(unknown).toEqual([]);
  });

  it('cada equivalencia apunta a un dibujo incluido', () => {
    const broken = Object.entries(IONICON_TO_PHOSPHOR).filter(([, key]) => !PHOSPHOR[key]);
    expect(broken).toEqual([]);
  });

  it('ningún nombre de Phosphor coincide con uno de Ionicons (Icon los distingue por el nombre)', () => {
    const glyphs = ioniconsGlyphs as Record<string, number>;
    const clashes = Object.keys(PHOSPHOR).filter((key) => glyphs[key] !== undefined);
    expect(clashes).toEqual([]);
  });

  it('los dibujos son trazados con, como mucho, un segundo tono al 20 %', () => {
    const drawings: Record<string, readonly (readonly [string] | readonly [string, number])[]> = PHOSPHOR;
    const odd = Object.entries(drawings).filter(([, paths]) =>
      paths.length === 0 || paths.some((p) => p[0].length === 0 || (p.length > 1 && p[1] !== 0.2)));
    expect(odd).toEqual([]);
  });
});
