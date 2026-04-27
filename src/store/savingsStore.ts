import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import { Hucha, HuchaMovement, HuchaMovementType } from '../types';
import { maybePromptForRating } from '../utils/rateAppPrompt';
import { useMovementStore } from './movementStore';

const STORAGE_KEY = '@moflo_huchas';
const SHARED_STORAGE_KEY = '@moflo_shared_huchas';
const MOV_STORAGE_KEY = '@moflo_hucha_movements';
const SHARED_MOV_STORAGE_KEY = '@moflo_shared_hucha_movements';

let unsubscribeShared: (() => void) | null = null;

const getUserHuchasCol = () => {
  const uid = auth().currentUser?.uid;
  if (!uid) throw new Error('No user');
  return firestore().collection('users').doc(uid).collection('huchas');
};

const getSharedHuchasCol = (accountId: string) =>
  firestore().collection('sharedAccounts').doc(accountId).collection('huchas');

const getUserMovementsCol = () => {
  const uid = auth().currentUser?.uid;
  if (!uid) throw new Error('No user');
  return firestore().collection('users').doc(uid).collection('huchaMovements');
};

const getSharedMovementsCol = (accountId: string) =>
  firestore().collection('sharedAccounts').doc(accountId).collection('huchaMovements');

const clampDayToMonth = (year: number, monthIdx: number, day: number): number => {
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  return Math.min(day, lastDay);
};

// Computes the next ISO date for a given day-of-month (1-31).
// If today is before the chosen day, it lands on this month; otherwise next month.
const computeNextContributionDate = (recurringDay: number, from: Date = new Date()): string => {
  const day = Math.max(1, Math.min(31, Math.round(recurringDay)));
  let year = from.getFullYear();
  let monthIdx = from.getMonth();
  if (from.getDate() >= day) monthIdx += 1;
  const actualDay = clampDayToMonth(year, monthIdx, day);
  return new Date(year, monthIdx, actualDay).toISOString();
};

// Advance to the next month while respecting the original recurringDay
// (clamped to month length), instead of letting JS overflow Feb 31 -> Mar 3.
const advanceToNextMonth = (isoDate: string, recurringDay?: number): string => {
  const d = new Date(isoDate);
  const day = recurringDay ?? d.getDate();
  const monthIdx = d.getMonth() + 1;
  const year = d.getFullYear();
  const actualDay = clampDayToMonth(year, monthIdx, day);
  return new Date(year, monthIdx, actualDay).toISOString();
};

interface SavingsStore {
  huchas: Hucha[];
  huchaMovements: HuchaMovement[];
  isLoading: boolean;
  sharedAccountId: string | null;
  showCreateModal: boolean;
  showAddMoneyModal: boolean;

  loadHuchas: () => Promise<void>;
  loadSharedHuchas: (accountId: string) => Promise<void>;
  loadHuchaMovements: (accountId?: string | null) => Promise<void>;
  createHucha: (data: Omit<Hucha, 'id' | 'currentAmount' | 'createdAt'>) => Promise<void>;
  updateHucha: (id: string, data: Partial<Hucha>) => Promise<void>;
  addToHucha: (huchaId: string, amount: number, type?: HuchaMovementType) => Promise<void>;
  deleteHucha: (id: string) => Promise<void>;
  applyAutomaticContributions: () => Promise<void>;
  subscribeToSharedHuchas: (accountId: string) => void;
  unsubscribeSharedHuchas: () => void;
  setSharedAccountId: (id: string | null) => void;
  setShowCreateModal: (show: boolean) => void;
  setShowAddMoneyModal: (show: boolean) => void;
  getTotalSaved: () => number;
  getTotalTarget: () => number;
  getAvailableBalance: () => number;
  resetStore: () => void;
}

export const useSavingsStore = create<SavingsStore>((set, get) => ({
  huchas: [],
  huchaMovements: [],
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

  getAvailableBalance: () => {
    const movements = useMovementStore.getState().movements;
    let total = 0;
    for (const m of movements) {
      total += m.type === 'income' ? m.amount : -m.amount;
    }
    for (const m of get().huchaMovements) {
      total += m.type === 'withdrawal' ? m.amount : -m.amount;
    }
    return total;
  },

  loadHuchaMovements: async (accountId) => {
    const resolvedId = accountId !== undefined ? accountId : get().sharedAccountId;
    const key = resolvedId ? SHARED_MOV_STORAGE_KEY : MOV_STORAGE_KEY;
    try {
      const cached = await AsyncStorage.getItem(key);
      if (cached) set({ huchaMovements: JSON.parse(cached) });

      const uid = auth().currentUser?.uid;
      if (!uid) return;

      const col = resolvedId
        ? getSharedMovementsCol(resolvedId)
        : getUserMovementsCol();
      const snap = await col.orderBy('createdAt', 'desc').get();
      const movements = snap.docs.map(d => ({ id: d.id, ...d.data() } as HuchaMovement));
      set({ huchaMovements: movements });
      await AsyncStorage.setItem(key, JSON.stringify(movements));
    } catch (e) {
      console.error('Error loading hucha movements:', e);
    }
  },

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
      await get().loadHuchaMovements(null);
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
      await get().loadHuchaMovements(accountId);
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
      ? computeNextContributionDate(data.recurringDay ?? 1)
      : undefined;

    const hucha: Hucha = {
      ...data,
      id,
      currentAmount: 0,
      createdAt: new Date().toISOString(),
      ...(uid ? { addedBy: uid } : {}),
      ...(nextContribDate ? { nextContributionDate: nextContribDate } : {}),
    };

    const firestoreData = Object.fromEntries(
      Object.entries(hucha).filter(([, v]) => v !== undefined)
    );

    try {
      if (sharedAccountId) {
        await getSharedHuchasCol(sharedAccountId).doc(id).set(firestoreData);
      } else {
        await getUserHuchasCol().doc(id).set(firestoreData);
        const updated = [hucha, ...get().huchas];
        set({ huchas: updated });
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        if (updated.length === 2) {
          setTimeout(() => maybePromptForRating('second_hucha'), 600);
        }
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

  addToHucha: async (huchaId, amount, type = 'deposit') => {
    const { sharedAccountId, huchas } = get();
    const hucha = huchas.find(h => h.id === huchaId);
    if (!hucha) return;

    if (type === 'deposit' && amount > get().getAvailableBalance()) return;

    const previousAmount = hucha.currentAmount;
    const newAmount = type === 'deposit'
      ? hucha.currentAmount + amount
      : Math.max(0, hucha.currentAmount - amount);
    const justCompleted = type === 'deposit'
      && hucha.targetAmount > 0
      && previousAmount < hucha.targetAmount
      && newAmount >= hucha.targetAmount;

    const updatedHuchas = huchas.map(h =>
      h.id === huchaId ? { ...h, currentAmount: newAmount } : h
    );
    set({ huchas: updatedHuchas });
    const huchasKey = sharedAccountId ? SHARED_STORAGE_KEY : STORAGE_KEY;
    await AsyncStorage.setItem(huchasKey, JSON.stringify(updatedHuchas));

    const movId = `hm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    const huchaMovement: HuchaMovement = {
      id: movId,
      huchaId,
      huchaName: hucha.name,
      huchaColor: hucha.color,
      type,
      amount,
      date: now,
      createdAt: now,
    };

    const updatedMovements = [huchaMovement, ...get().huchaMovements];
    set({ huchaMovements: updatedMovements });
    const movKey = sharedAccountId ? SHARED_MOV_STORAGE_KEY : MOV_STORAGE_KEY;
    await AsyncStorage.setItem(movKey, JSON.stringify(updatedMovements));

    try {
      const huchasCol = sharedAccountId
        ? getSharedHuchasCol(sharedAccountId)
        : getUserHuchasCol();
      await huchasCol.doc(huchaId).update({ currentAmount: newAmount });

      const movementsCol = sharedAccountId
        ? getSharedMovementsCol(sharedAccountId)
        : getUserMovementsCol();
      await movementsCol.doc(movId).set(huchaMovement);
    } catch (e) {
      console.error('Error adding to hucha:', e);
    }

    if (justCompleted && !sharedAccountId) {
      setTimeout(() => maybePromptForRating('goal_complete'), 600);
    }
  },

  deleteHucha: async (id) => {
    const { sharedAccountId, huchas, huchaMovements } = get();
    const updatedHuchas = huchas.filter(h => h.id !== id);
    const updatedMovements = huchaMovements.filter(m => m.huchaId !== id);
    set({ huchas: updatedHuchas, huchaMovements: updatedMovements });

    const huchasKey = sharedAccountId ? SHARED_STORAGE_KEY : STORAGE_KEY;
    const movKey = sharedAccountId ? SHARED_MOV_STORAGE_KEY : MOV_STORAGE_KEY;
    await AsyncStorage.setItem(huchasKey, JSON.stringify(updatedHuchas));
    await AsyncStorage.setItem(movKey, JSON.stringify(updatedMovements));

    try {
      if (sharedAccountId) {
        await getSharedHuchasCol(sharedAccountId).doc(id).delete();
        const movSnap = await getSharedMovementsCol(sharedAccountId)
          .where('huchaId', '==', id).get();
        const batch = firestore().batch();
        movSnap.docs.forEach(d => batch.delete(d.ref));
        if (movSnap.docs.length > 0) await batch.commit();
      } else {
        await getUserHuchasCol().doc(id).delete();
        const movSnap = await getUserMovementsCol().where('huchaId', '==', id).get();
        const batch = firestore().batch();
        movSnap.docs.forEach(d => batch.delete(d.ref));
        if (movSnap.docs.length > 0) await batch.commit();
      }
    } catch (e) {
      console.error('Error deleting hucha:', e);
    }
  },

  applyAutomaticContributions: async () => {
    const { huchas, sharedAccountId } = get();
    const now = new Date();
    const toUpdate: Hucha[] = [];
    const newMovements: HuchaMovement[] = [];
    let availableBalance = get().getAvailableBalance();

    for (const h of huchas) {
      if (!h.isAutomatic || !h.monthlyAmount || !h.nextContributionDate) continue;
      if (new Date(h.nextContributionDate) > now) continue;
      if (h.currentAmount >= h.targetAmount) continue;

      const contribution = Math.min(h.monthlyAmount, h.targetAmount - h.currentAmount);
      if (contribution <= 0) continue;
      if (contribution > availableBalance) continue;
      availableBalance -= contribution;

      toUpdate.push({
        ...h,
        currentAmount: h.currentAmount + contribution,
        nextContributionDate: advanceToNextMonth(h.nextContributionDate, h.recurringDay),
      });

      const nowIso = new Date().toISOString();
      newMovements.push({
        id: `hm_auto_${h.id}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        huchaId: h.id,
        huchaName: h.name,
        huchaColor: h.color,
        type: 'deposit',
        amount: contribution,
        date: h.nextContributionDate,
        createdAt: nowIso,
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

    if (newMovements.length > 0) {
      const allMovements = [...newMovements, ...get().huchaMovements];
      set({ huchaMovements: allMovements });
      const movKey = sharedAccountId ? SHARED_MOV_STORAGE_KEY : MOV_STORAGE_KEY;
      await AsyncStorage.setItem(movKey, JSON.stringify(allMovements));
    }

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

    const movementsCol = sharedAccountId
      ? getSharedMovementsCol(sharedAccountId)
      : getUserMovementsCol();
    for (const m of newMovements) {
      try {
        await movementsCol.doc(m.id).set(m);
      } catch (e) {
        console.error('Error saving automatic hucha movement:', e);
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
    set({
      huchas: [],
      huchaMovements: [],
      isLoading: false,
      sharedAccountId: null,
      showCreateModal: false,
      showAddMoneyModal: false,
    });
  },
}));
