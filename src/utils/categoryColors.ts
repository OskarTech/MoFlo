import { Category } from '../types';
import type { CategoryColorSet } from '../theme/categoryColors';
import { isHexColor } from './color';

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

// Color elegido por el usuario para una categoría: la posición del color en
// la paleta (no el color en sí), para que siga a la paleta y al modo oscuro,
// o un color libre (#RRGGBB) del selector, que es siempre el mismo.
// La clave es `${id}_${tipo}`, como la de las categorías ocultas
export type CategoryColorChoice = number | string;
export type CategoryColorChoices = Record<string, CategoryColorChoice>;

export const categoryColorKey = (id: string, type: 'income' | 'expense') => `${id}_${type}`;

export interface CategoryColors {
  // Color de una categoría de gasto: siempre el mismo, sea cual sea su puesto.
  // A partir de la 13.ª se repiten, siempre con su icono y su nombre al lado
  expense: (id: string) => string;
  // Para dibujar el gráfico de gastos siempre en el mismo orden, "Otros" al final
  expenseOrder: (id: string) => number;
  // Los ingresos van por puesto: 0 = la categoría que más suma. Con el id, si
  // el usuario le eligió un color, ese
  income: (rank: number, id?: string) => string;
}

export const makeCategoryColors = (
  set: CategoryColorSet,
  customCategories: Category[],
  choices: CategoryColorChoices = {},
): CategoryColors => {
  const order = buildExpenseOrder(customCategories);
  const chosen = (list: string[], id: string | undefined, type: 'income' | 'expense') => {
    if (id === undefined) return undefined;
    const choice = choices[categoryColorKey(id, type)];
    if (isHexColor(choice)) return choice;
    return typeof choice === 'number' && choice >= 0 ? list[choice % list.length] : undefined;
  };
  return {
    expense: (id) => {
      const picked = chosen(set.expense, id, 'expense');
      if (picked) return picked;
      const i = order.get(id);
      return i === undefined ? set.expenseOther : set.expense[i % set.expense.length];
    },
    expenseOrder: (id) => order.get(id) ?? Number.MAX_SAFE_INTEGER,
    income: (rank, id) => chosen(set.income, id, 'income') ?? set.income[rank % set.income.length],
  };
};
