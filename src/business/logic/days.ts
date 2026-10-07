import { BusinessConfig, BusinessDay, DayEntry, Order, OrdersSummary } from '../types';
import { cents, sumOf } from './basics';
import { summarizeOrders } from './orders';

/** Experto pedido a pedido */
export const usesOrders = (config: Pick<BusinessConfig, 'mode' | 'salesMethod'> | null | undefined): boolean =>
  config?.mode === 'expert' && config.salesMethod === 'orders';

/** Experto por caja */
export const usesTills = (config: Pick<BusinessConfig, 'mode' | 'salesMethod'> | null | undefined): boolean =>
  config?.mode === 'expert' && config.salesMethod === 'tills';

/** Lo apuntado en una caja o turno: lo de cada forma de cobro y lo escrito a mano */
export const entryTotal = (entry: Pick<DayEntry, 'amounts' | 'manual'>): number =>
  cents(sumOf(Object.values(entry.amounts ?? {}), (v) => v) + sumOf(entry.manual ?? [], (m) => m.amount));

/** Lo cobrado en efectivo: las formas de cobro de tipo efectivo */
export const entryCash = (entry: Pick<DayEntry, 'amounts'>, config: Pick<BusinessConfig, 'channels'>): number =>
  sumOf(
    Object.entries(entry.amounts ?? {}).filter(([id]) => config.channels?.[id]?.kind === 'cash'),
    ([, v]) => v,
  );

/**
 * El descuadre: lo contado menos lo que debería haber (el fondo más el
 * efectivo cobrado). Negativo, falta dinero. null si no se hizo arqueo
 */
export const entryCashDiff = (
  entry: Pick<DayEntry, 'amounts' | 'float' | 'counted'>, config: Pick<BusinessConfig, 'channels'>,
): number | null => {
  if (entry.counted == null || !Number.isFinite(entry.counted)) return null;
  return cents(entry.counted - ((entry.float ?? 0) + entryCash(entry, config)));
};

export const sectionsTotal = (entry: Pick<DayEntry, 'sections'>): number =>
  sumOf(Object.values(entry.sections ?? {}), (v) => v);

export interface DayFigures {
  sales: number;
  byChannel: Record<string, number>;
  channelNames: Record<string, string>;
  /** Lo escrito a mano, por su nombre */
  manual: Record<string, number>;
  /** Tickets apuntados (por caja) o pedidos (pedido a pedido) */
  tickets: number;
  cashDiff: number | null;
  /** De los pedidos de un día aún abierto: puede cambiar */
  provisional: boolean;
  ordersSummary: OrdersSummary | null;
  hasData: boolean;
}

const addEntries = (figures: DayFigures, entries: readonly DayEntry[], config: BusinessConfig) => {
  for (const entry of entries) {
    for (const [id, amount] of Object.entries(entry.amounts ?? {})) {
      if (!amount) continue;
      figures.byChannel[id] = cents((figures.byChannel[id] ?? 0) + amount);
      figures.channelNames[id] = config.channels?.[id]?.name ?? entry.channelNames?.[id] ?? id;
    }
    for (const m of entry.manual ?? []) {
      if (!m.amount) continue;
      figures.manual[m.name] = cents((figures.manual[m.name] ?? 0) + m.amount);
    }
    figures.sales = cents(figures.sales + entryTotal(entry));
    const diff = entryCashDiff(entry, config);
    if (diff != null) figures.cashDiff = cents((figures.cashDiff ?? 0) + diff);
  }
};

/**
 * Lo vendido un día. En pedido a pedido, mientras el día está abierto, sale de
 * los pedidos (lo que va de día); al cerrarlo, de lo que se confirmó en el
 * cierre. En el resto, de lo apuntado en cada caja o turno.
 */
export const dayFigures = (
  day: BusinessDay | null | undefined,
  dayOrders: readonly Order[],
  config: BusinessConfig,
): DayFigures => {
  const figures: DayFigures = {
    sales: 0, byChannel: {}, channelNames: {}, manual: {}, tickets: 0,
    cashDiff: null, provisional: false, ordersSummary: null, hasData: false,
  };
  const entries = Object.values(day?.entries ?? {});

  if (usesOrders(config) && day?.status !== 'closed') {
    const summary = summarizeOrders(dayOrders);
    figures.provisional = true;
    figures.ordersSummary = summary;
    figures.sales = summary.total;
    figures.tickets = summary.count;
    for (const [id, amount] of Object.entries(summary.byChannel)) {
      figures.byChannel[id] = amount;
      figures.channelNames[id] = config.channels?.[id]?.name ?? summary.channelNames[id] ?? id;
    }
    // Lo apuntado a mano ese día, sin el cierre anterior si se reabrió
    addEntries(figures, entries.filter((e) => !e.fromOrders), config);
    figures.hasData = summary.count + summary.voided > 0 || entries.some((e) => !e.fromOrders);
    return figures;
  }

  addEntries(figures, entries, config);
  figures.ordersSummary = day?.ordersSummary ?? null;
  figures.tickets = usesOrders(config)
    ? (day?.ordersSummary?.count ?? 0)
    : entries.reduce((n, e) => n + (e.tickets ?? 0), 0);
  figures.hasData = entries.length > 0;
  return figures;
};
