import { BusinessConfig } from '../types';

/**
 * El Resumen se arma con bloques, como los widgets de un móvil: se eligen los
 * que salen y en qué orden. Va en la configuración de la empresa, así que
 * todos los socios ven el mismo. Sin haber elegido nada, los que más importan.
 */

/** Todos los bloques; en este orden salen para añadirlos */
export const SUMMARY_BLOCKS = [
  'taxes', 'vat', 'costs', 'whereItGoes', 'days', 'payments', 'tickets', 'weekdays', 'suppliers',
] as const;

export type SummaryBlock = typeof SUMMARY_BLOCKS[number];

/** Con los que empieza: el beneficio real, el IVA, la materia prima y el personal, y en qué se va el dinero */
export const DEFAULT_SUMMARY_BLOCKS: readonly SummaryBlock[] = ['taxes', 'vat', 'costs', 'whereItGoes'];

const isBlock = (id: string): id is SummaryBlock => (SUMMARY_BLOCKS as readonly string[]).includes(id);

/** Los que salen, en su orden: sin repetidos ni los que esta versión no conoce */
export const summaryLayout = (config: Pick<BusinessConfig, 'summaryBlocks'>): SummaryBlock[] =>
  (config.summaryBlocks ? [...new Set(config.summaryBlocks.filter(isBlock))] : [...DEFAULT_SUMMARY_BLOCKS]);

/** Los que no salen, para añadirlos */
export const hiddenBlocks = (layout: readonly SummaryBlock[]): SummaryBlock[] =>
  SUMMARY_BLOCKS.filter((id) => !layout.includes(id));

/** Un puesto arriba (-1) o abajo (1) */
export const moveBlock = (layout: readonly SummaryBlock[], id: SummaryBlock, delta: -1 | 1): SummaryBlock[] => {
  const from = layout.indexOf(id);
  const to = from + delta;
  const next = [...layout];
  if (from < 0 || to < 0 || to >= layout.length) return next;
  [next[from], next[to]] = [next[to], next[from]];
  return next;
};

/** Al final */
export const addBlock = (layout: readonly SummaryBlock[], id: SummaryBlock): SummaryBlock[] =>
  (layout.includes(id) ? [...layout] : [...layout, id]);

export const removeBlock = (layout: readonly SummaryBlock[], id: SummaryBlock): SummaryBlock[] =>
  layout.filter((x) => x !== id);
