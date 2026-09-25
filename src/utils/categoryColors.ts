import { Category } from '../types';
import type { CategoryColorSet } from '../theme/categoryColors';

// Las predeterminadas de gasto, en el orden de sus colores. "Otros" no está:
// va siempre en gris y la última del gráfico
export const BASE_EXPENSE_ORDER = ['housing', 'food', 'transport', 'entertainment', 'subscriptions', 'unexpected'];

// Posición fija de cada categoría de gasto: las predeterminadas primero y las
// propias detrás, por orden de creación. Las borradas cuentan también: así
// borrar una no cambia el color de las demás, y sus movimientos conservan el suyo
export const buildExpenseOrder = (customCategories: Category[]): Map<string, number> => {
  const order = new Map<string, number>();
  BASE_EXPENSE_ORDER.forEach((id, i) => order.set(id, i));
  customCategories
    .filter((c) => c.type === 'expense')
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id))
    .forEach((c) => { if (!order.has(c.id)) order.set(c.id, order.size); });
  return order;
};

export interface CategoryColors {
  // Color de una categoría de gasto: siempre el mismo, sea cual sea su puesto.
  // A partir de la 9.ª se repiten, siempre con su icono y su nombre al lado
  expense: (id: string) => string;
  // Para dibujar el gráfico de gastos siempre en el mismo orden, "Otros" al final
  expenseOrder: (id: string) => number;
  // Los ingresos van por puesto: 0 = la categoría que más suma
  income: (rank: number) => string;
}

export const makeCategoryColors = (set: CategoryColorSet, customCategories: Category[]): CategoryColors => {
  const order = buildExpenseOrder(customCategories);
  return {
    expense: (id) => {
      const i = order.get(id);
      return i === undefined ? set.expenseOther : set.expense[i % set.expense.length];
    },
    expenseOrder: (id) => order.get(id) ?? Number.MAX_SAFE_INTEGER,
    income: (rank) => set.income[rank % set.income.length],
  };
};
