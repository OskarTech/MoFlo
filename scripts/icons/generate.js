/**
 * Genera src/components/common/icons/phosphor.generated.ts con los trazados de
 * los iconos de Phosphor que usa la app (solo esos: el set entero pesa varios
 * MB). Se ejecuta con `npm run icons` después de tocar icon-map.js.
 */
const fs = require('fs');
const path = require('path');
const { IONICON_TO_PHOSPHOR, LINE_ICONS, EXTRA } = require('./icon-map');

const ROOT = path.join(__dirname, '..', '..');
const ASSETS = path.join(ROOT, 'node_modules', '@phosphor-icons', 'core', 'assets');
const OUT = path.join(ROOT, 'src', 'components', 'common', 'icons', 'phosphor.generated.ts');

// "house-duotone" → trazados [d, opacidad?]. El grosor normal no lleva sufijo
// en los archivos de Phosphor; aquí se llama "-regular" para que ningún nombre
// coincida con uno de Ionicons
const readIcon = (key) => {
  const weight = ['duotone', 'fill', 'regular'].find((w) => key.endsWith(`-${w}`));
  if (!weight) throw new Error(`Grosor desconocido en "${key}"`);
  const fileName = weight === 'regular' ? key.slice(0, -'-regular'.length) : key;
  const file = path.join(ASSETS, weight, `${fileName}.svg`);
  if (!fs.existsSync(file)) throw new Error(`No existe el icono de Phosphor "${key}"`);
  const svg = fs.readFileSync(file, 'utf8');
  const paths = [...svg.matchAll(/<path d="([^"]+)"( opacity="([\d.]+)")?\/>/g)].map((m) =>
    m[3] ? [m[1], Number(m[3])] : [m[1]]);
  const elements = (svg.match(/<[a-z]+[\s>/]/g) || []).filter((t) => !t.startsWith('<svg'));
  if (paths.length === 0 || paths.length !== elements.length) {
    throw new Error(`"${key}" tiene elementos que no son trazados simples`);
  }
  return paths;
};

// Ionicons (con y sin "-outline") → clave de Phosphor con su grosor
const mapping = {};
for (const [ion, ph] of Object.entries(IONICON_TO_PHOSPHOR)) {
  if (LINE_ICONS.has(ion)) {
    mapping[`${ion}-outline`] = `${ph}-regular`;
    mapping[ion] = `${ph}-regular`;
  } else {
    mapping[`${ion}-outline`] = `${ph}-duotone`;
    mapping[ion] = `${ph}-fill`;
  }
}

const keys = [...new Set([...Object.values(mapping), ...EXTRA])].sort();
const icons = Object.fromEntries(keys.map((k) => [k, readIcon(k)]));

const header = `// Generado por scripts/icons/generate.js (npm run icons). No editar a mano.
// Iconos de Phosphor (https://phosphoricons.com, licencia MIT), en su caja de 256.
`;
const body = `
export const PHOSPHOR = ${JSON.stringify(icons)} as const satisfies Record<string, readonly (readonly [string] | readonly [string, number])[]>;

export type PhosphorName = keyof typeof PHOSPHOR;

export const IONICON_TO_PHOSPHOR: Readonly<Record<string, PhosphorName>> = ${JSON.stringify(
  Object.fromEntries(Object.entries(mapping).sort()),
)};
`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, header + body);
console.log(`${keys.length} iconos de Phosphor, ${Object.keys(mapping).length} nombres de Ionicons → ${path.relative(ROOT, OUT)} (${Math.round(fs.statSync(OUT).size / 1024)} KB)`);
