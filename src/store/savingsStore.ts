import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import { SavingMovement } from '../types';

const STORAGE_KEYS = {
  SAVINGS: '@moflo_savings',
  SHARED_SAVINGS: '@moflo_shared_savings',
};

let unsubscribeShared: (() => void) | null = null;

const getUserSavingsCol = () => {
  const uid = auth().currentUser?.uid;
  if (!uid) throw new Error('No authenticated user');
  return firestore().collection('users').doc(uid).collection('savings');
};

const getSharedSavingsCol = (accountId: string) =>
  firestore().collection('sharedAccounts').doc(accountId).collection('savings');

interface SavingsStore {
  savingMovements: SavingMovement[];
  isLoading: boolean;
  sharedAccountId: string | null;

  loadSavings: () => Promise<void>;
  loadSharedSavings: (accountId: string) => Promise<void>;
  deposit: (amount: number, description: string) => Promise<void>;
  withdraw: (amount: number, description: string) => Promise<boolean>;
  deleteSavingMovement: (id: string) => Promise<void>;
  subscribeToSharedSavings: (accountId: string) => void;
  unsubscribeSharedSavings: () => void;
  getSaldo: () => number;
  setSharedAccountId: (id: string | null) => void;
  resetStore: () => void;
}

export const useSavingsStore = create<SavingsStore>((set, get) => ({
  savingMovements: [],
  isLoading: false,
  sharedAccountId: null,

  resetStore: () => {
    get().unsubscribeSharedSavings();
    set({ savingMovements: [], isLoading: false, sharedAccountId: null });
  },

  setSharedAccountId: (id) => set({ sharedAccountId: id }),

  getSaldo: () => {
    const { savingMovements } = get();
    return savingMovements.reduce((total, m) => {
      return m.type === 'deposit' ? total + m.amount : total - m.amount;
    }, 0);
  },

  // ── CARGAR DATOS INDIVIDUALES ──────────────────────────────────
  loadSavings: async () => {
    set({ isLoading: true, sharedAccountId: null });
    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.SAVINGS);
      if (cached) set({ savingMovements: JSON.parse(cached) });

      const netState = await NetInfo.fetch();
      if (netState.isConnected) {
        const snap = await getUserSavingsCol().orderBy('date', 'desc').get();
        const movements = snap.docs.map(d => d.data() as SavingMovement);
        set({ savingMovements: movements });
        await AsyncStorage.setItem(STORAGE_KEYS.SAVINGS, JSON.stringify(movements));
      }
    } catch (e) {
      console.error('Error loading savings:', e);
    } finally {
      set({ isLoading: false });
    }
  },

  // ── CARGAR DATOS COMPARTIDOS ───────────────────────────────────
  loadSharedSavings: async (accountId) => {
    set({ isLoading: true, sharedAccountId: accountId });
    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.SHARED_SAVINGS);
      if (cached) set({ savingMovements: JSON.parse(cached) });

      const netState = await NetInfo.fetch();
      if (netState.isConnected) {
        const snap = await getSharedSavingsCol(accountId).orderBy('date', 'desc').get();
        const movements = snap.docs.map(d => d.data() as SavingMovement);
        set({ savingMovements: movements });
        await AsyncStorage.setItem(STORAGE_KEYS.SHARED_SAVINGS, JSON.stringify(movements));
      }
    } catch (e) {
      console.error('Error loading shared savings:', e);
    } finally {
      set({ isLoading: false });
    }
  },

  // ── DEPOSITAR ─────────────────────────────────────────────────
  deposit: async (amount, description) => {
    const { sharedAccountId } = get();
    const uid = auth().currentUser?.uid ?? '';
    const now = new Date().toISOString();
    const movement: SavingMovement = {
      id: `saving_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      amount,
      description,
      date: now,
      type: 'deposit',
      createdAt: now,
      ...(sharedAccountId ? { addedBy: uid } : {}),
    };

    const newMovements = [movement, ...get().savingMovements];
    set({ savingMovements: newMovements });

    try {
      if (sharedAccountId) {
        await getSharedSavingsCol(sharedAccountId).doc(movement.id).set(movement);
        await AsyncStorage.setItem(STORAGE_KEYS.SHARED_SAVINGS, JSON.stringify(newMovements));
      } else {
        await getUserSavingsCol().doc(movement.id).set(movement);
        await AsyncStorage.setItem(STORAGE_KEYS.SAVINGS, JSON.stringify(newMovements));
      }
    } catch (e) {
      set({ savingMovements: get().savingMovements.filter(m => m.id !== movement.id) });
      console.error('Error saving deposit:', e);
      throw e;
    }
  },

  // ── RETIRAR ───────────────────────────────────────────────────
  withdraw: async (amount, description) => {
    const { sharedAccountId } = get();
    const saldo = get().getSaldo();
    if (amount > saldo) return false;

    const uid = auth().currentUser?.uid ?? '';
    const now = new Date().toISOString();
    const movement: SavingMovement = {
      id: `saving_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      amount,
      description,
      date: now,
      type: 'withdrawal',
      createdAt: now,
      ...(sharedAccountId ? { addedBy: uid } : {}),
    };

    const newMovements = [movement, ...get().savingMovements];
    set({ savingMovements: newMovements });

    try {
      if (sharedAccountId) {
        await getSharedSavingsCol(sharedAccountId).doc(movement.id).set(movement);
        await AsyncStorage.setItem(STORAGE_KEYS.SHARED_SAVINGS, JSON.stringify(newMovements));
      } else {
        await getUserSavingsCol().doc(movement.id).set(movement);
        await AsyncStorage.setItem(STORAGE_KEYS.SAVINGS, JSON.stringify(newMovements));
      }
    } catch (e) {
      set({ savingMovements: get().savingMovements.filter(m => m.id !== movement.id) });
      console.error('Error saving withdrawal:', e);
      throw e;
    }
    return true;
  },

  // ── ELIMINAR ──────────────────────────────────────────────────
  deleteSavingMovement: async (id) => {
    const { sharedAccountId } = get();
    const previous = get().savingMovements;
    set({ savingMovements: previous.filter(m => m.id !== id) });

    try {
      if (sharedAccountId) {
        await getSharedSavingsCol(sharedAccountId).doc(id).delete();
        await AsyncStorage.setItem(
          STORAGE_KEYS.SHARED_SAVINGS,
          JSON.stringify(get().savingMovements)
        );
      } else {
        await getUserSavingsCol().doc(id).delete();
        await AsyncStorage.setItem(
          STORAGE_KEYS.SAVINGS,
          JSON.stringify(get().savingMovements)
        );
      }
    } catch (e) {
      set({ savingMovements: previous });
      console.error('Error deleting saving movement:', e);
      throw e;
    }
  },

  // ── LISTENER TIEMPO REAL (COMPARTIDA) ─────────────────────────
  subscribeToSharedSavings: (accountId) => {
    if (unsubscribeShared) unsubscribeShared();
    unsubscribeShared = getSharedSavingsCol(accountId)
      .orderBy('date', 'desc')
      .onSnapshot(snap => {
        const movements = snap.docs.map(d => d.data() as SavingMovement);
        set({ savingMovements: movements });
        AsyncStorage.setItem(STORAGE_KEYS.SHARED_SAVINGS, JSON.stringify(movements));
      });
  },

  unsubscribeSharedSavings: () => {
    if (unsubscribeShared) {
      unsubscribeShared();
      unsubscribeShared = null;
    }
  },
}));
