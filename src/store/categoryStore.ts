import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import { Category, MovementType } from '../types';
import { BASE_CATEGORIES } from '../constants/categories';

const STORAGE_KEY = '@moflo_custom_categories';

interface CategoryStore {
  customCategories: Category[];
  isLoading: boolean;

  loadCategories: () => Promise<void>;
  addCategory: (category: Omit<Category, 'id' | 'createdAt'>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  getCategoriesForType: (type: MovementType) => {
    id: string;
    name: string;
    icon: string;
    isCustom: boolean;
  }[];
  getCategoryName: (id: string, type: MovementType, t: (key: string) => string) => string;
  resetStore: () => void;
}

export const useCategoryStore = create<CategoryStore>((set, get) => ({
  customCategories: [],
  isLoading: false,

  resetStore: () => set({ customCategories: [] }),

  loadCategories: async () => {
    set({ isLoading: true });
    try {
      // Carga local primero
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) set({ customCategories: JSON.parse(raw) });

      // Sincroniza con Firestore
      const uid = auth().currentUser?.uid;
      if (!uid) return;

      const netState = await NetInfo.fetch();
      if (netState.isConnected) {
        const snap = await firestore()
          .collection('users').doc(uid)
          .collection('categories').get();
        const firestoreCategories = snap.docs.map(d => d.data() as Category);
        set({ customCategories: firestoreCategories });
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(firestoreCategories));
      }
    } catch (e) {
      console.error('Error loading categories:', e);
    } finally {
      set({ isLoading: false });
    }
  },

  addCategory: async (categoryData) => {
    const uid = auth().currentUser?.uid;
    if (!uid) return;

    const newCategory: Category = {
      ...categoryData,
      id: `custom_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };

    const updated = [...get().customCategories, newCategory];
    set({ customCategories: updated });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

    try {
      await firestore()
        .collection('users').doc(uid)
        .collection('categories').doc(newCategory.id)
        .set(newCategory);
    } catch (e) {
      console.error('Error saving category to Firestore:', e);
    }
  },

  deleteCategory: async (id) => {
    const uid = auth().currentUser?.uid;
    const updated = get().customCategories.filter(c => c.id !== id);
    set({ customCategories: updated });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

    if (uid) {
      try {
        await firestore()
          .collection('users').doc(uid)
          .collection('categories').doc(id)
          .delete();
      } catch (e) {
        console.error('Error deleting category from Firestore:', e);
      }
    }
  },

  // Devuelve base + custom para un tipo
  getCategoriesForType: (type) => {
    const base = BASE_CATEGORIES
      .filter(c => c.type === type)
      .map(c => ({ id: c.id, name: c.id, icon: c.icon, isCustom: false }));

    const custom = get().customCategories
      .filter(c => c.type === type)
      .map(c => ({ id: c.id, name: c.name, icon: c.icon, isCustom: true }));

    return [...base, ...custom];
  },

  // Resuelve el nombre de una categoría
  getCategoryName: (id, type, t) => {
    // Si es custom, busca en el store
    const custom = get().customCategories.find(c => c.id === id);
    if (custom) return custom.name;
    // Si es base, usa i18n
    return t(`movements.categories.${id}`);
  },
}));