import { BusinessConfig, BusinessDay, DayEntry, POS_ENTRY_ID } from '../types';
import { cents, sumOf } from './basics';

/** La entrada que manda la caja (la escribe el servidor y no se toca desde la app) */
export const isPosEntry = (entry: Pick<DayEntry, 'id'>): boolean => entry.id === POS_ENTRY_ID;

/** Las entradas de un día: la de la caja primero y después las apuntadas a mano, por hora */
export const dayEntries = (day: BusinessDay | null | undefined): DayEntry[] =>
  Object.values(day?.entries ?? {})
    .sort((a, b) => (Number(isPosEntry(b)) - Number(isPosEntry(a))) || a.at.localeCompare(b.at));

/** Lo vendido en una entrada: lo de cada forma de cobro y lo escrito a mano */
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

export interface DayFigures {
  sales: number;
  byChannel: Record<string, number>;
  channelNames: Record<string, string>;
  /** Lo escrito a mano, por su nombre */
  manual: Record<string, number>;
  tickets: number;
  /** Lo vendido en las entradas con tickets: con ellos da el ticket medio */
  ticketSales: number;
  cashDiff: number | null;
  /** Repartos con factura que la caja aún no había cobrado: no es venta */
  pending: number;
  /** Lo ha mandado la caja */
  fromPos: boolean;
  hasData: boolean;
}

/** Lo vendido un día: lo de la caja y lo apuntado a mano */
export const dayFigures = (day: BusinessDay | null | undefined, config: BusinessConfig): DayFigures => {
  const figures: DayFigures = {
    sales: 0, byChannel: {}, channelNames: {}, manual: {}, tickets: 0, ticketSales: 0,
    cashDiff: null, pending: 0, fromPos: false, hasData: false,
  };
  for (const entry of dayEntries(day)) {
    for (const [id, amount] of Object.entries(entry.amounts ?? {})) {
      if (!amount) continue;
      figures.byChannel[id] = cents((figures.byChannel[id] ?? 0) + amount);
      figures.channelNames[id] = config.channels?.[id]?.name ?? entry.channelNames?.[id] ?? id;
    }
    for (const m of entry.manual ?? []) {
      if (!m.amount) continue;
      figures.manual[m.name] = cents((figures.manual[m.name] ?? 0) + m.amount);
    }
    const total = entryTotal(entry);
    figures.sales = cents(figures.sales + total);
    if (entry.tickets) {
      figures.tickets += entry.tickets;
      figures.ticketSales = cents(figures.ticketSales + total);
    }
    figures.pending = cents(figures.pending + (entry.pending ?? 0));
    if (isPosEntry(entry)) figures.fromPos = true;
    const diff = entryCashDiff(entry, config);
    if (diff != null) figures.cashDiff = cents((figures.cashDiff ?? 0) + diff);
    figures.hasData = true;
  }
  return figures;
};
