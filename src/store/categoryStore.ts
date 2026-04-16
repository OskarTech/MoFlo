import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import { Category, MovementType } from '../types';
import { BASE_CATEGORIES } from '../constants/categories';

const CUSTOM_KEY = '@moflo_custom_categories';
const HIDDEN_KEY = '@moflo_hidden_base';

interface CategoryStore {
  customCategories: Category[];
  hiddenBaseCategories: string[];
  isLoading: boolean;

  loadCategories: () => Promise<void>;
  addCategory: (category: Omit<Category, 'id' | 'createdAt'>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  hideBaseCategory: (id: string, type: MovementType) => Promise<void>;
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
  hiddenBaseCategories: [],
  isLoading: false,

  resetStore: () => set({
    customCategories: [],
    hiddenBaseCategories: [],
  }),

  loadCategories: async () => {
    set({ isLoading: true });
    try {
      const uid = auth().currentUser?.uid;
      if (!uid) return;

      // Carga local primero para respuesta inmediata
      const customRaw = await AsyncStorage.getItem(CUSTOM_KEY);
      if (customRaw) set({ customCategories: JSON.parse(customRaw) });

      const hiddenRaw = await AsyncStorage.getItem(`${HIDDEN_KEY}_${uid}`);
      if (hiddenRaw) set({ hiddenBaseCategories: JSON.parse(hiddenRaw) });

      // SIEMPRE sincroniza con Firestore cuando hay conexión
      const netState = await NetInfo.fetch();
      if (netState.isConnected) {
        const snap = await firestore()
          .collection('users').doc(uid)
          .collection('categories').get();

        const firestoreCategories = snap.docs.map(d => d.data() as Category);

        // Actualiza siempre con los datos de Firestore
        set({ customCategories: firestoreCategories });
        await AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(firestoreCategories));
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
    await AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(updated));

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
    await AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(updated));

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

  hideBaseCategory: async (id, type) => {
    const uid = auth().currentUser?.uid;
    const key = `${id}_${type}`;
    const updated = [...get().hiddenBaseCategories, key];
    set({ hiddenBaseCategories: updated });
    await AsyncStorage.setItem(
      `${HIDDEN_KEY}_${uid}`,
      JSON.stringify(updated)
    );
  },

  getCategoriesForType: (type) => {
    const { hiddenBaseCategories } = get();

    const base = BASE_CATEGORIES
      .filter(c => c.type === type)
      .filter(c => !hiddenBaseCategories.includes(`${c.id}_${type}`))
      .map(c => ({ id: c.id, name: c.id, icon: c.icon, isCustom: false }));

    const custom = get().customCategories
      .filter(c => c.type === type)
      .map(c => ({ id: c.id, name: c.name, icon: c.icon, isCustom: true }));

    return [...base, ...custom];
  },

  getCategoryName: (id, type, t) => {
    const custom = get().customCategories.find(c => c.id === id);
    if (custom) return custom.name;
    return t(`movements.categories.${id}`);
  },
}));