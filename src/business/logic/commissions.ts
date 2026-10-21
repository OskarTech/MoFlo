import { Channel, DayEntry } from '../types';
import { cents } from './basics';

/**
 * Las comisiones de un día: lo que se quedan las formas de cobro que la tienen
 * (el banco del datáfono, Stripe), sobre todo lo cobrado ese día. Un % de lo
 * cobrado y, si la caja dice cuántos cobros hubo, un fijo por cada uno.
 *
 * Se apuntan como gastos con un id fijo por día y forma de cobro. El servidor,
 * al llegar el cierre de la caja, calcula lo mismo (functions/src/pos.ts): si
 * se cambia aquí, se cambia allí, para que la app y él no se pisen.
 */

export const commissionExpenseId = (dayId: string, channelId: string): string =>
  `com_${dayId.replace(/-/g, '')}_${channelId}`;

/** Si un gasto es una de estas comisiones, que se apuntan solas */
export const isCommissionExpense = (expenseId: string): boolean => expenseId.startsWith('com_');

/** La comisión de cada forma de cobro de la configuración (0 si no tiene o no se ha cobrado nada) */
export const dayCommissions = (
  entries: readonly Pick<DayEntry, 'amounts' | 'counts'>[],
  channels: Record<string, Pick<Channel, 'commissionPct' | 'commissionFixed'>>,
): Record<string, number> => {
  const amounts: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    for (const [id, v] of Object.entries(entry.amounts ?? {})) amounts[id] = cents((amounts[id] ?? 0) + (v || 0));
    for (const [id, n] of Object.entries(entry.counts ?? {})) counts[id] = (counts[id] ?? 0) + (n || 0);
  }
  const out: Record<string, number> = {};
  for (const [id, channel] of Object.entries(channels)) {
    const pct = channel.commissionPct ?? 0;
    const fixed = channel.commissionFixed ?? 0;
    const amount = amounts[id] ?? 0;
    const value = (pct > 0 && amount > 0 ? (amount * pct) / 100 : 0) + (fixed > 0 ? (counts[id] ?? 0) * fixed : 0);
    out[id] = value > 0 ? cents(value) : 0;
  }
  return out;
};
