import { useCallback, useMemo } from 'react';
import type { IoniconName } from '../components/common/Icon';
import { useTranslation } from 'react-i18next';
import { useSharedAccountStore } from '../store/sharedAccountStore';
import { useCategoryStore } from '../store/categoryStore';
import { useSharedCategoryStore } from '../store/sharedCategoryStore';
import { useCategoryColors } from './useCategoryColors';
import { MovementType } from '../types';

export type { IoniconName };

/**
 * Nombre, icono, color y si está borrada, de una categoría de la cuenta activa
 * (individual o compartida). Reúne lo que cada pantalla calculaba por su cuenta.
 */
export const useCategoryInfo = () => {
  const { t } = useTranslation();
  const isSharedMode = useSharedAccountStore((s) => s.isSharedMode);
  const { getCategoryName, getCategoryIcon, isCategoryDeleted } = useCategoryStore();
  // Suscritas para que el nombre, el icono y las borradas se actualicen al cambiar
  useCategoryStore((s) => s.customCategories);
  useCategoryStore((s) => s.hiddenBaseCategories);
  const {
    getSharedCategoryName, getSharedCategoryIcon, isSharedCategoryDeleted,
  } = useSharedCategoryStore();
  useSharedCategoryStore((s) => s.sharedCustomCategories);
  useSharedCategoryStore((s) => s.sharedHiddenCategories);
  const colors = useCategoryColors();

  const name = useCallback(
    (id: string, type: MovementType) =>
      (isSharedMode ? getSharedCategoryName(id, type, t) : getCategoryName(id, type, t)),
    [isSharedMode, getSharedCategoryName, getCategoryName, t],
  );
  const icon = useCallback(
    (id: string, type: MovementType): IoniconName => {
      const base = isSharedMode ? getSharedCategoryIcon(id, type) : getCategoryIcon(id, type);
      return `${base}-outline` as IoniconName;
    },
    [isSharedMode, getSharedCategoryIcon, getCategoryIcon],
  );
  const deleted = useCallback(
    (id: string, type: MovementType) =>
      (isSharedMode ? isSharedCategoryDeleted(id, type) : isCategoryDeleted(id, type)),
    [isSharedMode, isSharedCategoryDeleted, isCategoryDeleted],
  );
  const color = useCallback(
    (id: string, type: MovementType) => (type === 'income' ? colors.incomeOf(id) : colors.expense(id)),
    [colors],
  );

  return useMemo(() => ({ name, icon, deleted, color, colors }), [name, icon, deleted, color, colors]);
};
