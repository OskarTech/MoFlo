import { BusinessExpense, BusinessRecurring } from '../types';
import { USUALLY_FIXED_TYPES } from '../templates';
import { isCommissionExpense } from './commissions';

/**
 * Los tipos de gasto en el orden de uso, como las categorías en la app: el
 * más usado, el primero. Al apuntar un gasto cuentan los apuntados a mano (no
 * las comisiones ni los que salen de un fijo, que se apuntan solos); al
 * apuntar un fijo, los fijos. A igualdad, los de `first` y después el orden
 * de la lista.
 */

const countByType = (rows: readonly { typeId: string }[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.typeId, (counts.get(row.typeId) ?? 0) + 1);
  return counts;
};

export const byUse = <T extends { id: string }>(
  items: readonly T[],
  counts: ReadonlyMap<string, number>,
  first: readonly string[] = [],
): T[] => {
  const rank = (id: string) => {
    const i = first.indexOf(id);
    return i < 0 ? first.length : i;
  };
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => ((counts.get(b.item.id) ?? 0) - (counts.get(a.item.id) ?? 0))
      || (rank(a.item.id) - rank(b.item.id))
      || (a.index - b.index))
    .map((x) => x.item);
};

/** Para la ventana de un gasto */
export const expenseTypesByUse = <T extends { id: string }>(
  types: readonly T[],
  expenses: readonly Pick<BusinessExpense, 'id' | 'typeId' | 'recurringId'>[],
): T[] => byUse(types, countByType(expenses.filter((e) => !e.recurringId && !isCommissionExpense(e.id))));

/** Para la ventana de un fijo: sin fijos aún, delante los tipos que suelen serlo */
export const recurringTypesByUse = <T extends { id: string }>(
  types: readonly T[],
  recurring: readonly Pick<BusinessRecurring, 'typeId'>[],
): T[] => byUse(types, countByType(recurring), USUALLY_FIXED_TYPES);
