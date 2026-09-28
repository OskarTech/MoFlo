import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCategoryStore } from '../../store/categoryStore';
import { useTheme } from '../../hooks/useTheme';
import { choicesForPalette } from '../../utils/categoryColors';
import CategoriesManager, { CategoriesApi } from '../../components/categories/CategoriesManager';

// Categorías de la cuenta individual. Solo se entra con premium
const CategoriesScreen = () => {
  const { t } = useTranslation();
  const { paletteId } = useTheme();
  const {
    addCategory, updateCategory, deleteCategory, hideBaseCategory, setCategoryColor,
    getCategoriesForType, showAddCategoryModal, setShowAddCategoryModal,
    customCategories, hiddenBaseCategories, paletteCategoryColors,
  } = useCategoryStore();

  const api: CategoriesApi = useMemo(() => ({
    getForType: getCategoriesForType,
    add: ({ name, icon, type }) => addCategory({ name, icon, type, isCustom: true }),
    update: (id, updates) => updateCategory(id, updates),
    remove: (id) => deleteCategory(id),
    hideBase: (id, type) => hideBaseCategory(id, type),
    // El color elegido vale solo para la paleta en uso
    setColor: (id, type, colorIndex) => setCategoryColor(paletteId, id, type, colorIndex),
    choices: choicesForPalette(paletteCategoryColors, paletteId),
    // getCategoriesForType lee las propias y las ocultas del store: la lista se
    // rehace cuando cambian
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [customCategories, hiddenBaseCategories, paletteCategoryColors, paletteId]);

  return (
    <CategoriesManager
      api={api}
      subtitle={t('settings.individualCategoriesSubtitle')}
      addRequested={showAddCategoryModal}
      onAddRequestHandled={() => setShowAddCategoryModal(false)}
    />
  );
};

export default CategoriesScreen;
