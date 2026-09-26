import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useSharedCategoryStore } from '../../store/sharedCategoryStore';
import CategoriesManager, { CategoriesApi } from '../../components/categories/CategoriesManager';

type RouteParams = { SharedCategories: { accountId: string } };

// Categorías de la cuenta compartida: los cambios los ven todos los miembros
const SharedCategoriesScreen = () => {
  const { t } = useTranslation();
  const route = useRoute<RouteProp<RouteParams, 'SharedCategories'>>();
  const accountId = route.params?.accountId;

  const {
    addSharedCategory, updateSharedCategory, deleteSharedCategory, hideSharedBaseCategory,
    setSharedCategoryColor, getSharedCategoriesForType, showAddCategoryModal, setShowAddCategoryModal,
    sharedCustomCategories, sharedHiddenCategories, sharedCategoryColors,
  } = useSharedCategoryStore();

  const api: CategoriesApi = useMemo(() => ({
    getForType: getSharedCategoriesForType,
    add: ({ name, icon, type }) => addSharedCategory(accountId, { name, icon, type, isCustom: true }),
    update: (id, updates) => updateSharedCategory(accountId, id, updates),
    remove: (id) => deleteSharedCategory(accountId, id),
    hideBase: (id, type) => hideSharedBaseCategory(accountId, id, type),
    setColor: (id, type, colorIndex) => setSharedCategoryColor(accountId, id, type, colorIndex),
    choices: sharedCategoryColors,
    // getSharedCategoriesForType lee las propias y las ocultas del store: la
    // lista se rehace cuando cambian
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [accountId, sharedCustomCategories, sharedHiddenCategories, sharedCategoryColors]);

  return (
    <CategoriesManager
      api={api}
      subtitle={t('sharedAccount.sharedCategoriesSubtitle')}
      addRequested={showAddCategoryModal}
      onAddRequestHandled={() => setShowAddCategoryModal(false)}
    />
  );
};

export default SharedCategoriesScreen;
