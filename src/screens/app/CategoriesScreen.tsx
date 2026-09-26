import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCategoryStore } from '../../store/categoryStore';
import CategoriesManager, { CategoriesApi } from '../../components/categories/CategoriesManager';

// Categorías de la cuenta individual. Solo se entra con premium
const CategoriesScreen = () => {
  const { t } = useTranslation();
  const {
    addCategory, updateCategory, deleteCategory, hideBaseCategory, setCategoryColor,
    getCategoriesForType, showAddCategoryModal, setShowAddCategoryModal,
    customCategories, hiddenBaseCategories, categoryColors,
  } = useCategoryStore();

  const api: CategoriesApi = useMemo(() => ({
    getForType: getCategoriesForType,
    add: ({ name, icon, type }) => addCategory({ name, icon, type, isCustom: true }),
    update: (id, updates) => updateCategory(id, updates),
    remove: (id) => deleteCategory(id),
    hideBase: (id, type) => hideBaseCategory(id, type),
    setColor: (id, type, colorIndex) => setCategoryColor(id, type, colorIndex),
    choices: categoryColors,
    // getCategoriesForType lee las propias y las ocultas del store: la lista se
    // rehace cuando cambian
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [customCategories, hiddenBaseCategories, categoryColors]);

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
