import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import { Category, MovementType } from '../types';
import { BASE_CATEGORIES, getBaseCategoryIcon } from '../constants/categories';

const CUSTOM_KEY = '@moflo_custom_categories';
const HIDDEN_KEY = '@moflo_hidden_base';

let categoriesUnsubscribe: (() => void) | null = null;
let hiddenUnsubscribe: (() => void) | null = null;

interface CategoryStore {
  customCategories: Category[];
  hiddenBaseCategories: string[];
  isLoading: boolean;
  // El botón + de la barra la activa en la pantalla de categorías
  showAddCategoryModal: boolean;
  setShowAddCategoryModal: (show: boolean) => void;

  loadCategories: () => Promise<void>;
  addCategory: (category: Omit<Category, 'id' | 'createdAt'>) => Promise<void>;
  updateCategory: (id: string, updates: { name: string; icon: string }) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  hideBaseCategory: (id: string, type: MovementType) => Promise<void>;
  getCategoriesForType: (type: MovementType) => {
    id: string;
    name: string;
    icon: string;
    isCustom: boolean;
  }[];
  getCategoryName: (id: string, type: MovementType, t: (key: string) => string) => string;
  getCategoryIcon: (id: string, type: MovementType) => string;
  isCategoryDeleted: (id: string, type: MovementType) => boolean;
  subscribeToCategories: () => void;
  unsubscribeCategories: () => void;
  resetStore: () => void;
}

export const useCategoryStore = create<CategoryStore>((set, get) => ({
  customCategories: [],
  hiddenBaseCategories: [],
  isLoading: false,
  showAddCategoryModal: false,

  setShowAddCategoryModal: (show) => set({ showAddCategoryModal: show }),

  resetStore: () => {
    if (categoriesUnsubscribe) { categoriesUnsubscribe(); categoriesUnsubscribe = null; }
    if (hiddenUnsubscribe) { hiddenUnsubscribe(); hiddenUnsubscribe = null; }
    set({
      customCategories: [],
      hiddenBaseCategories: [],
    });
  },

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

      // ── CUSTOM CATEGORIES: download ─────────────────────────────────
      // No se resuben las categorías locales que faltan en Firestore: podían haberse
      // borrado en otro dispositivo y volvían a aparecer. Las creadas sin conexión
      // las guarda Firestore como escrituras pendientes y las sube él solo.
      const snap = await firestore()
        .collection('users').doc(uid)
        .collection('categories').get();
      const remoteCustom = snap.docs.map(d => d.data() as Category);
      set({ customCategories: remoteCustom });
      await AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(remoteCustom));

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

    // Sin await: con mala conexión no deja bloqueado el botón de guardar
    firestore()
      .collection('users').doc(uid)
      .collection('categories').doc(newCategory.id)
      .set(newCategory)
      .catch((e) => console.error('Error saving category to Firestore:', e));
  },

  updateCategory: async (id, updates) => {
    const uid = auth().currentUser?.uid;
    const updated = get().customCategories.map(c =>
      c.id === id ? { ...c, ...updates } : c
    );
    set({ customCategories: updated });
    await AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(updated));

    if (uid) {
      // Sin await: con mala conexión no deja bloqueado el botón de guardar
      firestore()
        .collection('users').doc(uid)
        .collection('categories').doc(id)
        .update(updates)
        .catch((e) => console.error('Error updating category in Firestore:', e));
    }
  },

  // Borrado suave: deja de aparecer para elegir, pero los movimientos que ya la
  // usan siguen mostrando su nombre
  deleteCategory: async (id) => {
    const uid = auth().currentUser?.uid;
    const updated = get().customCategories.map(c => c.id === id ? { ...c, deleted: true } : c);
    set({ customCategories: updated });
    await AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(updated));

    if (uid) {
      const ref = firestore()
        .collection('users').doc(uid)
        .collection('categories').doc(id);
      ref.update({ deleted: true }).catch((e) => {
        console.error('Error deleting category from Firestore:', e);
        // Si no se puede marcar, se borra como antes
        ref.delete().catch(() => {});
      });
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

    // Guarda en Firestore para sincronización entre dispositivos.
    // arrayUnion en vez de la lista local entera: dos dispositivos ocultando a
    // la vez se pisaban y una de las dos se perdía.
    try {
      await firestore()
        .collection('users').doc(uid)
        .update({ hiddenCategories: firestore.FieldValue.arrayUnion(key) });
    } catch (e) {
      // Si el doc no existe, usa set con merge
      await firestore()
        .collection('users').doc(uid)
        .set({ hiddenCategories: firestore.FieldValue.arrayUnion(key) }, { merge: true });
    }
  },

  getCategoriesForType: (type) => {
    const { hiddenBaseCategories } = get();

    const base = BASE_CATEGORIES
      .filter(c => c.type === type)
      .filter(c => !hiddenBaseCategories.includes(`${c.id}_${type}`))
      .map(c => ({ id: c.id, name: c.id, icon: c.icon, isCustom: false }));

    const custom = get().customCategories
      .filter(c => c.type === type && !c.deleted)
      .map(c => ({ id: c.id, name: c.name, icon: c.icon, isCustom: true }));

    return [...base, ...custom];
  },

  getCategoryName: (id, type, t) => {
    const custom = get().customCategories.find(c => c.id === id);
    if (custom) return custom.name;
    return t(`movements.categories.${id}`);
  },

  // Como el nombre, incluye las borradas y las ocultas (getCategoriesForType no):
  // un movimiento conserva el icono aunque su categoría ya no se pueda elegir
  getCategoryIcon: (id, type) =>
    get().customCategories.find(c => c.id === id)?.icon
      ?? getBaseCategoryIcon(id, type)
      ?? 'ellipsis-horizontal',

  // Borrada, o predeterminada y oculta (en pantalla también se "elimina"): ya no
  // se puede elegir, pero los movimientos que la usan la muestran tachada
  isCategoryDeleted: (id, type) => {
    const custom = get().customCategories.find(c => c.id === id);
    if (custom) return !!custom.deleted;
    return get().hiddenBaseCategories.includes(`${id}_${type}`);
  },

  unsubscribeCategories: () => {
    if (categoriesUnsubscribe) { categoriesUnsubscribe(); categoriesUnsubscribe = null; }
    if (hiddenUnsubscribe) { hiddenUnsubscribe(); hiddenUnsubscribe = null; }
  },

  subscribeToCategories: () => {
    const uid = auth().currentUser?.uid;
    if (!uid) return;

    if (categoriesUnsubscribe) { categoriesUnsubscribe(); categoriesUnsubscribe = null; }
    categoriesUnsubscribe = firestore()
      .collection('users').doc(uid)
      .collection('categories')
      .onSnapshot((snap) => {
        const categories = snap.docs.map(d => d.data() as Category);
        set({ customCategories: categories });
        AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(categories)).catch(() => {});
      }, (e) => {
        console.error('Error listening to categories:', e);
      });

    if (hiddenUnsubscribe) { hiddenUnsubscribe(); hiddenUnsubscribe = null; }
    hiddenUnsubscribe = firestore()
      .collection('users').doc(uid)
      .onSnapshot((doc) => {
        if (doc.exists()) {
          const hidden: string[] = doc.data()?.hiddenCategories ?? [];
          set({ hiddenBaseCategories: hidden });
          AsyncStorage.setItem(`${HIDDEN_KEY}_${uid}`, JSON.stringify(hidden)).catch(() => {});
        }
      }, (e) => {
        console.error('Error listening to hidden categories:', e);
      });
  },
}));