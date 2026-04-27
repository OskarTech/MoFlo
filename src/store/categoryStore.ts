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

      // Carga local primero
      const customRaw = await AsyncStorage.getItem(CUSTOM_KEY);
      const localCustom: Category[] = customRaw ? JSON.parse(customRaw) : [];
      if (localCustom.length) set({ customCategories: localCustom });

      const hiddenRaw = await AsyncStorage.getItem(`${HIDDEN_KEY}_${uid}`);
      const localHidden: string[] = hiddenRaw ? JSON.parse(hiddenRaw) : [];
      if (localHidden.length) set({ hiddenBaseCategories: localHidden });

      const netState = await NetInfo.fetch();
      if (!netState.isConnected) return;

      // ── CUSTOM CATEGORIES: sync up local-only items, then download ───
      const snap = await firestore()
        .collection('users').doc(uid)
        .collection('categories').get();
      const remoteCustom = snap.docs.map(d => d.data() as Category);
      const remoteIds = new Set(remoteCustom.map(c => c.id));

      // Backfill: any local category missing remotely was never persisted — push it.
      const missing = localCustom.filter(c => !remoteIds.has(c.id));
      const merged = [...remoteCustom];
      for (const cat of missing) {
        try {
          await firestore()
            .collection('users').doc(uid)
            .collection('categories').doc(cat.id)
            .set(cat);
          merged.push(cat);
        } catch (e) {
          console.error('Error backfilling category:', e);
        }
      }
      set({ customCategories: merged });
      await AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(merged));

      // ── HIDDEN BASE CATEGORIES: union local + remote ────────────────
      const userDoc = await firestore().collection('users').doc(uid).get();
      const remoteHidden: string[] = userDoc.data()?.hiddenCategories ?? [];
      const mergedHidden = Array.from(new Set([...remoteHidden, ...localHidden]));
      if (mergedHidden.length > remoteHidden.length) {
        try {
          await firestore()
            .collection('users').doc(uid)
            .set({ hiddenCategories: mergedHidden }, { merge: true });
        } catch (e) {
          console.error('Error backfilling hidden categories:', e);
        }
      }
      set({ hiddenBaseCategories: mergedHidden });
      await AsyncStorage.setItem(`${HIDDEN_KEY}_${uid}`, JSON.stringify(mergedHidden));
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
    if (!uid) return;

    const key = `${id}_${type}`;
    const updated = [...get().hiddenBaseCategories, key];
    set({ hiddenBaseCategories: updated });

    // Guarda en AsyncStorage
    await AsyncStorage.setItem(`${HIDDEN_KEY}_${uid}`, JSON.stringify(updated));

    // Guarda en Firestore para sincronización entre dispositivos
    try {
      await firestore()
        .collection('users').doc(uid)
        .update({ hiddenCategories: updated });
    } catch (e) {
      // Si el doc no existe, usa set con merge
      await firestore()
        .collection('users').doc(uid)
        .set({ hiddenCategories: updated }, { merge: true });
    }
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