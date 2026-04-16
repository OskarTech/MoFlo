import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';
import { Category, MovementType } from '../types';
import { BASE_CATEGORIES } from '../constants/categories';

const SHARED_CUSTOM_KEY = '@moflo_shared_custom_categories';
const SHARED_HIDDEN_KEY = '@moflo_shared_hidden_categories';

interface SharedCategoryStore {
  sharedCustomCategories: Category[];
  sharedHiddenCategories: string[];
  isLoading: boolean;

  loadSharedCategories: (accountId: string) => Promise<void>;
  addSharedCategory: (accountId: string, category: Omit<Category, 'id' | 'createdAt'>) => Promise<void>;
  deleteSharedCategory: (accountId: string, id: string) => Promise<void>;
  hideSharedBaseCategory: (accountId: string, id: string, type: MovementType) => Promise<void>;
  getSharedCategoriesForType: (type: MovementType) => { id: string; name: string; icon: string; isCustom: boolean }[];
  getSharedCategoryName: (id: string, type: MovementType, t: (key: string) => string) => string;
  resetSharedCategories: () => void;
}

export const useSharedCategoryStore = create<SharedCategoryStore>((set, get) => ({
  sharedCustomCategories: [],
  sharedHiddenCategories: [],
  isLoading: false,

  resetSharedCategories: () => set({
    sharedCustomCategories: [],
    sharedHiddenCategories: [],
  }),

  loadSharedCategories: async (accountId) => {
    set({ isLoading: true });
    try {
      // Cache local
      const customRaw = await AsyncStorage.getItem(`${SHARED_CUSTOM_KEY}_${accountId}`);
      if (customRaw) set({ sharedCustomCategories: JSON.parse(customRaw) });

      const hiddenRaw = await AsyncStorage.getItem(`${SHARED_HIDDEN_KEY}_${accountId}`);
      if (hiddenRaw) set({ sharedHiddenCategories: JSON.parse(hiddenRaw) });

      // Firestore
      const snap = await firestore()
        .collection('sharedAccounts').doc(accountId)
        .collection('categories').get();

      const categories = snap.docs.map(d => d.data() as Category);
      set({ sharedCustomCategories: categories });
      await AsyncStorage.setItem(
        `${SHARED_CUSTOM_KEY}_${accountId}`,
        JSON.stringify(categories)
      );

      // Ocultas
      const accountDoc = await firestore()
        .collection('sharedAccounts').doc(accountId).get();
      const hidden: string[] = accountDoc.data()?.hiddenCategories ?? [];
      set({ sharedHiddenCategories: hidden });
      await AsyncStorage.setItem(
        `${SHARED_HIDDEN_KEY}_${accountId}`,
        JSON.stringify(hidden)
      );
    } catch (e) {
      console.error('Error loading shared categories:', e);
    } finally {
      set({ isLoading: false });
    }
  },

  addSharedCategory: async (accountId, categoryData) => {
    const newCategory: Category = {
      ...categoryData,
      id: `shared_custom_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };

    const updated = [...get().sharedCustomCategories, newCategory];
    set({ sharedCustomCategories: updated });
    await AsyncStorage.setItem(
      `${SHARED_CUSTOM_KEY}_${accountId}`,
      JSON.stringify(updated)
    );

    try {
      await firestore()
        .collection('sharedAccounts').doc(accountId)
        .collection('categories').doc(newCategory.id)
        .set(newCategory);
    } catch (e) {
      console.error('Error saving shared category:', e);
    }
  },

  deleteSharedCategory: async (accountId, id) => {
    const updated = get().sharedCustomCategories.filter(c => c.id !== id);
    set({ sharedCustomCategories: updated });
    await AsyncStorage.setItem(
      `${SHARED_CUSTOM_KEY}_${accountId}`,
      JSON.stringify(updated)
    );

    try {
      await firestore()
        .collection('sharedAccounts').doc(accountId)
        .collection('categories').doc(id)
        .delete();
    } catch (e) {
      console.error('Error deleting shared category:', e);
    }
  },

  hideSharedBaseCategory: async (accountId, id, type) => {
    const key = `${id}_${type}`;
    const updated = [...get().sharedHiddenCategories, key];
    set({ sharedHiddenCategories: updated });
    await AsyncStorage.setItem(
      `${SHARED_HIDDEN_KEY}_${accountId}`,
      JSON.stringify(updated)
    );

    try {
      await firestore()
        .collection('sharedAccounts').doc(accountId)
        .update({ hiddenCategories: updated });
    } catch (e) {
      await firestore()
        .collection('sharedAccounts').doc(accountId)
        .set({ hiddenCategories: updated }, { merge: true });
    }
  },

  getSharedCategoriesForType: (type) => {
    const { sharedHiddenCategories, sharedCustomCategories } = get();

    const base = BASE_CATEGORIES
      .filter(c => c.type === type)
      .filter(c => !sharedHiddenCategories.includes(`${c.id}_${type}`))
      .map(c => ({ id: c.id, name: c.id, icon: c.icon, isCustom: false }));

    const custom = sharedCustomCategories
      .filter(c => c.type === type)
      .map(c => ({ id: c.id, name: c.name, icon: c.icon, isCustom: true }));

    return [...base, ...custom];
  },

  getSharedCategoryName: (id, type, t) => {
    const custom = get().sharedCustomCategories.find(c => c.id === id);
    if (custom) return custom.name;
    return t(`movements.categories.${id}`);
  },
}));