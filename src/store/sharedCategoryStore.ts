import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';
import { Category, MovementType } from '../types';
import { BASE_CATEGORIES, getBaseCategoryIcon } from '../constants/categories';

const SHARED_CUSTOM_KEY = '@moflo_shared_custom_categories';
const SHARED_HIDDEN_KEY = '@moflo_shared_hidden_categories';

let categoriesUnsubscribe: (() => void) | null = null;
let hiddenUnsubscribe: (() => void) | null = null;

interface SharedCategoryStore {
  sharedCustomCategories: Category[];
  sharedHiddenCategories: string[];
  isLoading: boolean;
  // El botón + de la barra la activa en la pantalla de categorías compartidas
  showAddCategoryModal: boolean;
  setShowAddCategoryModal: (show: boolean) => void;

  loadSharedCategories: (accountId: string) => Promise<void>;
  addSharedCategory: (accountId: string, category: Omit<Category, 'id' | 'createdAt'>) => Promise<void>;
  updateSharedCategory: (accountId: string, id: string, updates: { name: string; icon: string }) => Promise<void>;
  deleteSharedCategory: (accountId: string, id: string) => Promise<void>;
  hideSharedBaseCategory: (accountId: string, id: string, type: MovementType) => Promise<void>;
  getSharedCategoriesForType: (type: MovementType) => { id: string; name: string; icon: string; isCustom: boolean }[];
  getSharedCategoryName: (id: string, type: MovementType, t: (key: string) => string) => string;
  getSharedCategoryIcon: (id: string, type: MovementType) => string;
  isSharedCategoryDeleted: (id: string, type: MovementType) => boolean;
  resetSharedCategories: () => void;
  subscribeToSharedCategories: (accountId: string) => void;
  unsubscribeCategories: () => void;
}

export const useSharedCategoryStore = create<SharedCategoryStore>((set, get) => ({
  sharedCustomCategories: [],
  sharedHiddenCategories: [],
  isLoading: false,
  showAddCategoryModal: false,

  setShowAddCategoryModal: (show) => set({ showAddCategoryModal: show }),

  resetSharedCategories: () => {
    if (categoriesUnsubscribe) { categoriesUnsubscribe(); categoriesUnsubscribe = null; }
    if (hiddenUnsubscribe) { hiddenUnsubscribe(); hiddenUnsubscribe = null; }
    set({ sharedCustomCategories: [], sharedHiddenCategories: [] });
  },

  loadSharedCategories: async (accountId) => {
    set({ isLoading: true });
    try {
      // Cache local
      const customRaw = await AsyncStorage.getItem(`${SHARED_CUSTOM_KEY}_${accountId}`);
      const localCustom: Category[] = customRaw ? JSON.parse(customRaw) : [];
      if (localCustom.length) set({ sharedCustomCategories: localCustom });

      const hiddenRaw = await AsyncStorage.getItem(`${SHARED_HIDDEN_KEY}_${accountId}`);
      const localHidden: string[] = hiddenRaw ? JSON.parse(hiddenRaw) : [];
      if (localHidden.length) set({ sharedHiddenCategories: localHidden });

      // ── CUSTOM: download ────────────────────────────────────────────
      // No se resuben las categorías locales que faltan en Firestore: podían haberse
      // borrado por otro miembro y volvían a aparecer. Las creadas sin conexión
      // las guarda Firestore como escrituras pendientes y las sube él solo.
      const snap = await firestore()
        .collection('sharedAccounts').doc(accountId)
        .collection('categories').get();
      const remoteCustom = snap.docs.map(d => d.data() as Category);
      set({ sharedCustomCategories: remoteCustom });
      await AsyncStorage.setItem(
        `${SHARED_CUSTOM_KEY}_${accountId}`,
        JSON.stringify(remoteCustom)
      );

      // ── HIDDEN: union local + remote ────────────────────────────────
      const accountDoc = await firestore()
        .collection('sharedAccounts').doc(accountId).get();
      const remoteHidden: string[] = accountDoc.data()?.hiddenCategories ?? [];
      const mergedHidden = Array.from(new Set([...remoteHidden, ...localHidden]));
      if (mergedHidden.length > remoteHidden.length) {
        try {
          await firestore()
            .collection('sharedAccounts').doc(accountId)
            .set({ hiddenCategories: mergedHidden }, { merge: true });
        } catch (e) {
          console.error('Error backfilling shared hidden categories:', e);
        }
      }
      set({ sharedHiddenCategories: mergedHidden });
      await AsyncStorage.setItem(
        `${SHARED_HIDDEN_KEY}_${accountId}`,
        JSON.stringify(mergedHidden)
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

    // Sin await: con mala conexión no deja bloqueado el botón de guardar
    firestore()
      .collection('sharedAccounts').doc(accountId)
      .collection('categories').doc(newCategory.id)
      .set(newCategory)
      .catch((e) => console.error('Error saving shared category:', e));
  },

  updateSharedCategory: async (accountId, id, updates) => {
    const updated = get().sharedCustomCategories.map(c =>
      c.id === id ? { ...c, ...updates } : c
    );
    set({ sharedCustomCategories: updated });
    await AsyncStorage.setItem(
      `${SHARED_CUSTOM_KEY}_${accountId}`,
      JSON.stringify(updated)
    );

    // Sin await: con mala conexión no deja bloqueado el botón de guardar
    firestore()
      .collection('sharedAccounts').doc(accountId)
      .collection('categories').doc(id)
      .update(updates)
      .catch((e) => console.error('Error updating shared category:', e));
  },

  // Borrado suave: deja de aparecer para elegir (a todos los miembros), pero los
  // movimientos que ya la usan siguen mostrando su nombre
  deleteSharedCategory: async (accountId, id) => {
    const updated = get().sharedCustomCategories.map(c => c.id === id ? { ...c, deleted: true } : c);
    set({ sharedCustomCategories: updated });
    await AsyncStorage.setItem(
      `${SHARED_CUSTOM_KEY}_${accountId}`,
      JSON.stringify(updated)
    );

    const ref = firestore()
      .collection('sharedAccounts').doc(accountId)
      .collection('categories').doc(id);
    ref.update({ deleted: true }).catch((e) => {
      console.error('Error deleting shared category:', e);
      // Si no se puede marcar, se borra como antes
      ref.delete().catch(() => {});
    });
  },

  hideSharedBaseCategory: async (accountId, id, type) => {
    const key = `${id}_${type}`;
    const updated = [...get().sharedHiddenCategories, key];
    set({ sharedHiddenCategories: updated });
    await AsyncStorage.setItem(
      `${SHARED_HIDDEN_KEY}_${accountId}`,
      JSON.stringify(updated)
    );

    // arrayUnion en vez de la lista local entera: dos miembros ocultando a la
    // vez se pisaban y una de las dos se perdía
    try {
      await firestore()
        .collection('sharedAccounts').doc(accountId)
        .update({ hiddenCategories: firestore.FieldValue.arrayUnion(key) });
    } catch (e) {
      await firestore()
        .collection('sharedAccounts').doc(accountId)
        .set({ hiddenCategories: firestore.FieldValue.arrayUnion(key) }, { merge: true });
    }
  },

  getSharedCategoriesForType: (type) => {
    const { sharedHiddenCategories, sharedCustomCategories } = get();

    const base = BASE_CATEGORIES
      .filter(c => c.type === type)
      .filter(c => !sharedHiddenCategories.includes(`${c.id}_${type}`))
      .map(c => ({ id: c.id, name: c.id, icon: c.icon, isCustom: false }));

    const custom = sharedCustomCategories
      .filter(c => c.type === type && !c.deleted)
      .map(c => ({ id: c.id, name: c.name, icon: c.icon, isCustom: true }));

    return [...base, ...custom];
  },

  getSharedCategoryName: (id, type, t) => {
    const custom = get().sharedCustomCategories.find(c => c.id === id);
    if (custom) return custom.name;
    return t(`movements.categories.${id}`);
  },

  // Como el nombre, incluye las borradas y las ocultas (getSharedCategoriesForType
  // no): un movimiento conserva el icono aunque su categoría ya no se pueda elegir
  getSharedCategoryIcon: (id, type) =>
    get().sharedCustomCategories.find(c => c.id === id)?.icon
      ?? getBaseCategoryIcon(id, type)
      ?? 'ellipsis-horizontal',

  // Borrada, o predeterminada y oculta (en pantalla también se "elimina"): ya no
  // se puede elegir, pero los movimientos que la usan la muestran tachada
  isSharedCategoryDeleted: (id, type) => {
    const custom = get().sharedCustomCategories.find(c => c.id === id);
    if (custom) return !!custom.deleted;
    return get().sharedHiddenCategories.includes(`${id}_${type}`);
  },

  unsubscribeCategories: () => {
    if (categoriesUnsubscribe) { categoriesUnsubscribe(); categoriesUnsubscribe = null; }
    if (hiddenUnsubscribe) { hiddenUnsubscribe(); hiddenUnsubscribe = null; }
  },

  subscribeToSharedCategories: (accountId) => {
    if (categoriesUnsubscribe) {
      categoriesUnsubscribe();
      categoriesUnsubscribe = null;
    }

    categoriesUnsubscribe = firestore()
      .collection('sharedAccounts').doc(accountId)
      .collection('categories')
      .onSnapshot((snap) => {
        const categories = snap.docs.map(d => d.data() as Category);
        set({ sharedCustomCategories: categories });
        AsyncStorage.setItem(
          `@moflo_shared_custom_categories_${accountId}`,
          JSON.stringify(categories)
        );
      }, (e) => {
        console.error('Error listening to shared categories:', e);
      });

    // Listener para categorías ocultas
    if (hiddenUnsubscribe) { hiddenUnsubscribe(); hiddenUnsubscribe = null; }
    hiddenUnsubscribe = firestore()
      .collection('sharedAccounts').doc(accountId)
      .onSnapshot((doc) => {
        if (doc.exists()) {
          const hidden: string[] = doc.data()?.hiddenCategories ?? [];
          set({ sharedHiddenCategories: hidden });
          AsyncStorage.setItem(
            `@moflo_shared_hidden_categories_${accountId}`,
            JSON.stringify(hidden)
          );
        }
      }, (e) => {
        console.error('Error listening to shared hidden categories:', e);
      });
  },
}));