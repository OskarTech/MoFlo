import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import { Hucha } from '../types';

const STORAGE_KEY = '@moflo_huchas';
const SHARED_STORAGE_KEY = '@moflo_shared_huchas';

let unsubscribeShared: (() => void) | null = null;

const getUserHuchasCol = () => {
  const uid = auth().currentUser?.uid;
  if (!uid) throw new Error('No user');
  return firestore().collection('users').doc(uid).collection('huchas');
};

const getSharedHuchasCol = (accountId: string) =>
  firestore().collection('sharedAccounts').doc(accountId).collection('huchas');

const advanceOneMonth = (isoDate: string): string => {
  const d = new Date(isoDate);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
};

interface SavingsStore {
  huchas: Hucha[];
  isLoading: boolean;
  sharedAccountId: string | null;
  showCreateModal: boolean;

  loadHuchas: () => Promise<void>;
  loadSharedHuchas: (accountId: string) => Promise<void>;
  createHucha: (data: Omit<Hucha, 'id' | 'currentAmount' | 'createdAt'>) => Promise<void>;
  updateHucha: (id: string, data: Partial<Hucha>) => Promise<void>;
  addToHucha: (huchaId: string, amount: number) => Promise<void>;
  deleteHucha: (id: string) => Promise<void>;
  applyAutomaticContributions: () => Promise<void>;
  subscribeToSharedHuchas: (accountId: string) => void;
  unsubscribeSharedHuchas: () => void;
  setSharedAccountId: (id: string | null) => void;
  setShowCreateModal: (show: boolean) => void;
  showAddMoneyModal: boolean;
  setShowAddMoneyModal: (show: boolean) => void;
  getTotalSaved: () => number;
  getTotalTarget: () => number;
  resetStore: () => void;
}

export const useSavingsStore = create<SavingsStore>((set, get) => ({
  huchas: [],
  isLoading: false,
  sharedAccountId: null,
  showCreateModal: false,
  showAddMoneyModal: false,

  setShowCreateModal: (show) => set({ showCreateModal: show }),
  setShowAddMoneyModal: (show) => set({ showAddMoneyModal: show }),

  setSharedAccountId: (id) => set({ sharedAccountId: id }),

  getTotalSaved: () =>
    get().huchas.reduce((acc, h) => acc + h.currentAmount, 0),

  getTotalTarget: () =>
    get().huchas.reduce((acc, h) => acc + h.targetAmount, 0),

  loadHuchas: async () => {
    set({ isLoading: true });
    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEY);
      if (cached) set({ huchas: JSON.parse(cached) });

      const uid = auth().currentUser?.uid;
      if (!uid) return;

      const snap = await getUserHuchasCol().orderBy('createdAt', 'desc').get();
      const huchas = snap.docs.map(d => ({ id: d.id, ...d.data() } as Hucha));
      set({ huchas });
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(huchas));
    } catch (e) {
      console.error('Error loading huchas:', e);
    } finally {
      set({ isLoading: false });
    }
  },

  loadSharedHuchas: async (accountId) => {
    set({ isLoading: true });
    try {
      const cached = await AsyncStorage.getItem(SHARED_STORAGE_KEY);
      if (cached) set({ huchas: JSON.parse(cached) });

      const snap = await getSharedHuchasCol(accountId).orderBy('createdAt', 'desc').get();
      const huchas = snap.docs.map(d => ({ id: d.id, ...d.data() } as Hucha));
      set({ huchas });
      await AsyncStorage.setItem(SHARED_STORAGE_KEY, JSON.stringify(huchas));
    } catch (e) {
      console.error('Error loading shared huchas:', e);
    } finally {
      set({ isLoading: false });
    }
  },

  createHucha: async (data) => {
    const { sharedAccountId } = get();
    const uid = auth().currentUser?.uid;
    const id = `hucha_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const nextContribDate = data.isAutomatic
      ? (() => {
          const d = new Date();
          d.setDate(1);
          d.setMonth(d.getMonth() + 1);
          return d.toISOString();
        })()
      : undefined;

    const hucha: Hucha = {
      ...data,
      id,
      currentAmount: 0,
      createdAt: new Date().toISOString(),
      ...(uid ? { addedBy: uid } : {}),
      ...(nextContribDate ? { nextContributionDate: nextContribDate } : {}),
    };

    // Strip undefined values — Firestore rejects them
    const firestoreData = Object.fromEntries(
      Object.entries(hucha).filter(([, v]) => v !== undefined)
    );

    try {
      if (sharedAccountId) {
        await getSharedHuchasCol(sharedAccountId).doc(id).set(firestoreData);
        // onSnapshot handles state update in shared mode — don't add locally
      } else {
        await getUserHuchasCol().doc(id).set(firestoreData);
        const updated = [hucha, ...get().huchas];
        set({ huchas: updated });
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      }
    } catch (e) {
      console.error('Error creating hucha:', e);
    }
  },

  updateHucha: async (id, data) => {
    const { sharedAccountId, huchas } = get();
    const updated = huchas.map(h => h.id === id ? { ...h, ...data } : h);
    set({ huchas: updated });
    const key = sharedAccountId ? SHARED_STORAGE_KEY : STORAGE_KEY;
    await AsyncStorage.setItem(key, JSON.stringify(updated));
    const firestoreData = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined)
    ) as Record<string, unknown>;
    try {
      if (sharedAccountId) {
        await getSharedHuchasCol(sharedAccountId).doc(id).update(firestoreData);
      } else {
        await getUserHuchasCol().doc(id).update(firestoreData);
      }
    } catch (e) {
      console.error('Error updating hucha:', e);
    }
  },

  addToHucha: async (huchaId, amount) => {
    const { sharedAccountId, huchas } = get();
    const hucha = huchas.find(h => h.id === huchaId);
    if (!hucha) return;

    const newAmount = hucha.currentAmount + amount;
    const updated = huchas.map(h =>
      h.id === huchaId ? { ...h, currentAmount: newAmount } : h
    );
    set({ huchas: updated });
    const key = sharedAccountId ? SHARED_STORAGE_KEY : STORAGE_KEY;
    await AsyncStorage.setItem(key, JSON.stringify(updated));
    try {
      if (sharedAccountId) {
        await getSharedHuchasCol(sharedAccountId).doc(huchaId).update({ currentAmount: newAmount });
      } else {
        await getUserHuchasCol().doc(huchaId).update({ currentAmount: newAmount });
      }
    } catch (e) {
      console.error('Error adding to hucha:', e);
    }
  },

  deleteHucha: async (id) => {
    const { sharedAccountId, huchas } = get();
    const updated = huchas.filter(h => h.id !== id);
    set({ huchas: updated });
    const key = sharedAccountId ? SHARED_STORAGE_KEY : STORAGE_KEY;
    await AsyncStorage.setItem(key, JSON.stringify(updated));
    try {
      if (sharedAccountId) {
        await getSharedHuchasCol(sharedAccountId).doc(id).delete();
      } else {
        await getUserHuchasCol().doc(id).delete();
      }
    } catch (e) {
      console.error('Error deleting hucha:', e);
    }
  },

  applyAutomaticContributions: async () => {
    const { huchas, sharedAccountId } = get();
    const now = new Date();
    const toUpdate: Hucha[] = [];

    for (const h of huchas) {
      if (!h.isAutomatic || !h.monthlyAmount || !h.nextContributionDate) continue;
      if (new Date(h.nextContributionDate) > now) continue;
      if (h.currentAmount >= h.targetAmount) continue;

      toUpdate.push({
        ...h,
        currentAmount: Math.min(h.currentAmount + h.monthlyAmount, h.targetAmount),
        nextContributionDate: advanceOneMonth(h.nextContributionDate),
      });
    }

    if (toUpdate.length === 0) return;

    const updated = huchas.map(h => {
      const u = toUpdate.find(t => t.id === h.id);
      return u ?? h;
    });
    set({ huchas: updated });
    const key = sharedAccountId ? SHARED_STORAGE_KEY : STORAGE_KEY;
    await AsyncStorage.setItem(key, JSON.stringify(updated));

    for (const u of toUpdate) {
      try {
        if (sharedAccountId) {
          await getSharedHuchasCol(sharedAccountId).doc(u.id).update({
            currentAmount: u.currentAmount,
            nextContributionDate: u.nextContributionDate,
          });
        } else {
          await getUserHuchasCol().doc(u.id).update({
            currentAmount: u.currentAmount,
            nextContributionDate: u.nextContributionDate,
          });
        }
      } catch (e) {
        console.error('Error applying automatic contribution:', e);
      }
    }
  },

  subscribeToSharedHuchas: (accountId) => {
    if (unsubscribeShared) { unsubscribeShared(); unsubscribeShared = null; }

    unsubscribeShared = getSharedHuchasCol(accountId)
      .orderBy('createdAt', 'desc')
      .onSnapshot((snap) => {
        const huchas = snap.docs.map(d => ({ id: d.id, ...d.data() } as Hucha));
        set({ huchas });
        AsyncStorage.setItem(SHARED_STORAGE_KEY, JSON.stringify(huchas));
      }, (e) => {
        console.error('Error listening to shared huchas:', e);
      });
  },

  unsubscribeSharedHuchas: () => {
    if (unsubscribeShared) { unsubscribeShared(); unsubscribeShared = null; }
  },

  resetStore: () => {
    if (unsubscribeShared) { unsubscribeShared(); unsubscribeShared = null; }
    set({ huchas: [], isLoading: false, sharedAccountId: null, showCreateModal: false, showAddMoneyModal: false });
  },
}));
