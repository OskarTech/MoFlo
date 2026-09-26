import { useMemo } from 'react';
import { useTheme } from './useTheme';
import { useSharedAccountStore } from '../store/sharedAccountStore';
import { useCategoryStore } from '../store/categoryStore';
import { useSharedCategoryStore } from '../store/sharedCategoryStore';
import { useMovementStore } from '../store/movementStore';
import { BASE_CATEGORIES } from '../constants/categories';
import { makeCategoryColors, CategoryColors, buildExpenseOrder } from '../utils/categoryColors';
import { MovementType } from '../types';

export interface CategoryColorsWithIncome extends CategoryColors {
  // Color de una categoría de ingreso fuera de un gráfico (filas, ventanas):
  // el de su puesto en lo que ha entrado este mes, como en el resumen; las que
  // no tienen ingresos este mes van detrás, en el orden de la lista
  incomeOf: (id: string) => string;
  // El que tendría sin color elegido (la opción "Automático" al editarla).
  // Sin id, el de una categoría nueva
  autoColor: (id: string | null, type: MovementType) => string;
}

// Colores de las categorías con la paleta y el modo activos. Las propias y los
// colores elegidos salen de la cuenta activa: en compartida, de la cuenta
export const useCategoryColors = (): CategoryColorsWithIncome => {
  const { categoryColors } = useTheme();
  const isSharedMode = useSharedAccountStore((s) => s.isSharedMode);
  const customCategories = useCategoryStore((s) => s.customCategories);
  const choices = useCategoryStore((s) => s.categoryColors);
  const sharedCustomCategories = useSharedCategoryStore((s) => s.sharedCustomCategories);
  const sharedChoices = useSharedCategoryStore((s) => s.sharedCategoryColors);
  const movements = useMovementStore((s) => s.movements);
  const list = isSharedMode ? sharedCustomCategories : customCategories;
  const activeChoices = isSharedMode ? sharedChoices : choices;

  const incomeRank = useMemo(() => {
    const now = new Date();
    const totals = new Map<string, number>();
    movements.forEach((m) => {
      if (m.type !== 'income') return;
      const d = new Date(m.date);
      if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return;
      totals.set(m.category, (totals.get(m.category) ?? 0) + m.amount);
    });
    const rank = new Map<string, number>();
    [...totals.entries()].sort((a, b) => b[1] - a[1]).forEach(([id]) => rank.set(id, rank.size));
    BASE_CATEGORIES.filter((c) => c.type === 'income').forEach((c) => {
      if (!rank.has(c.id)) rank.set(c.id, rank.size);
    });
    list.filter((c) => c.type === 'income').forEach((c) => {
      if (!rank.has(c.id)) rank.set(c.id, rank.size);
    });
    return rank;
  }, [movements, list]);

  return useMemo(() => {
    const colors = makeCategoryColors(categoryColors, list, activeChoices);
    const auto = makeCategoryColors(categoryColors, list);
    // Una categoría de gasto nueva va detrás de las que ya hay
    const nextExpense = buildExpenseOrder(list).size;
    return {
      ...colors,
      incomeOf: (id: string) => colors.income(incomeRank.get(id) ?? incomeRank.size, id),
      autoColor: (id: string | null, type: MovementType) => {
        if (type === 'income') return auto.income(id === null ? incomeRank.size : incomeRank.get(id) ?? incomeRank.size);
        return id === null
          ? categoryColors.expense[nextExpense % categoryColors.expense.length]
          : auto.expense(id);
      },
    };
  }, [categoryColors, list, activeChoices, incomeRank]);
};
