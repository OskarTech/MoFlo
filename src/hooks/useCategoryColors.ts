import { useMemo } from 'react';
import { useTheme } from './useTheme';
import { useSharedAccountStore } from '../store/sharedAccountStore';
import { useCategoryStore } from '../store/categoryStore';
import { useSharedCategoryStore } from '../store/sharedCategoryStore';
import { makeCategoryColors } from '../utils/categoryColors';

// Colores de las categorías con la paleta y el modo activos. Las propias salen
// de la cuenta activa: en compartida, de las categorías de la cuenta
export const useCategoryColors = () => {
  const { categoryColors } = useTheme();
  const isSharedMode = useSharedAccountStore((s) => s.isSharedMode);
  const customCategories = useCategoryStore((s) => s.customCategories);
  const sharedCustomCategories = useSharedCategoryStore((s) => s.sharedCustomCategories);
  const list = isSharedMode ? sharedCustomCategories : customCategories;
  return useMemo(() => makeCategoryColors(categoryColors, list), [categoryColors, list]);
};
