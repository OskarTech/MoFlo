import { BusinessExpense, BusinessRecurring } from '../types';
import { dayIdOfDate, daysInMonth, monthKey } from './basics';

/**
 * Los fijos (alquiler, luz, nóminas) se convierten en un gasto cada mes, el
 * día que tocan. El gasto lleva un id fijo por fijo y mes: si dos socios lo
 * crean a la vez, es el mismo documento. Si se borra el gasto de un mes, el
 * mes se apunta en el fijo (skipped) y no se vuelve a crear.
 */

export const recurringExpenseId = (recurringId: string, month: string): string =>
  `rec_${recurringId}_${month.replace('-', '')}`;

/**
 * Lo que ya está apuntado de los fijos: los ids de los gastos y, de los que
 * salen de un fijo, su fijo y su mes (por si alguno no lleva el id de siempre)
 */
export const existingRecurringKeys = (
  expenses: readonly Pick<BusinessExpense, 'id' | 'date' | 'recurringId'>[],
): Set<string> => {
  const keys = new Set<string>();
  for (const e of expenses) {
    keys.add(e.id);
    if (e.recurringId) keys.add(recurringExpenseId(e.recurringId, e.date.slice(0, 7)));
  }
  return keys;
};

const monthIndexOf = (date: Date) => date.getFullYear() * 12 + date.getMonth();

/** El día que toca en ese mes (si no lo tiene, el último) */
export const dueDayId = (recurring: Pick<BusinessRecurring, 'day'>, year: number, month0: number): string =>
  dayIdOfDate(new Date(year, month0, Math.min(Math.max(1, recurring.day), daysInMonth(year, month0))));

export const expenseFromRecurring = (
  recurring: BusinessRecurring, month: string, date: string, by: string, now: string,
): BusinessExpense => ({
  id: recurringExpenseId(recurring.id, month),
  date,
  amount: recurring.amount,
  name: recurring.name,
  typeId: recurring.typeId,
  typeName: recurring.typeName,
  supplierId: recurring.supplierId ?? null,
  supplierName: recurring.supplierName ?? null,
  workerId: recurring.workerId ?? null,
  workerName: recurring.workerName ?? null,
  recurringId: recurring.id,
  by,
  createdAt: now,
});

/**
 * Los gastos de fijos que ya tocaban y no están: desde el mes en que se creó
 * cada fijo hasta hoy. `existing`, lo que ya hay (ver existingRecurringKeys)
 */
export const dueRecurringExpenses = (
  recurring: readonly BusinessRecurring[],
  existing: ReadonlySet<string>,
  today: Date,
  by: string,
): BusinessExpense[] => {
  const out: BusinessExpense[] = [];
  const todayId = dayIdOfDate(today);
  const now = today.toISOString();
  for (const rec of recurring) {
    if (!rec.active || !(rec.amount > 0)) continue;
    const created = new Date(rec.createdAt);
    if (Number.isNaN(created.getTime())) continue;
    for (let index = monthIndexOf(created); index <= monthIndexOf(today); index++) {
      const year = Math.floor(index / 12);
      const month0 = index - year * 12;
      const month = monthKey(year, month0);
      const date = dueDayId(rec, year, month0);
      if (date > todayId) continue;
      if (rec.skipped?.includes(month)) continue;
      if (existing.has(recurringExpenseId(rec.id, month))) continue;
      out.push(expenseFromRecurring(rec, month, date, by, now));
    }
  }
  return out;
};

/** Los fijos de un mes que aún no tienen su gasto: lo que falta por pagar */
export const pendingRecurringOfMonth = (
  recurring: readonly BusinessRecurring[],
  existing: ReadonlySet<string>,
  year: number,
  month0: number,
): { recurring: BusinessRecurring; date: string }[] => {
  const month = monthKey(year, month0);
  const index = year * 12 + month0;
  return recurring
    .filter((rec) => {
      if (!rec.active || !(rec.amount > 0)) return false;
      const created = new Date(rec.createdAt);
      if (Number.isNaN(created.getTime()) || monthIndexOf(created) > index) return false;
      if (rec.skipped?.includes(month)) return false;
      return !existing.has(recurringExpenseId(rec.id, month));
    })
    .map((rec) => ({ recurring: rec, date: dueDayId(rec, year, month0) }));
};
