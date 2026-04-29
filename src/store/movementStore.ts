import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import { Movement, RecurringMovement, MonthlySummary } from '../types';
import {
  addMovementToFirestore,
  deleteMovementFromFirestore,
  fetchMovementsFromFirestore,
  addRecurringToFirestore,
  deleteRecurringFromFirestore,
  fetchRecurringFromFirestore,
} from '../services/firebase/firestore.service';
import { enqueue, processQueue } from '../services/syncQueue.service';

const STORAGE_KEYS = {
  MOVEMENTS: '@moflo_movements',
  RECURRING: '@moflo_recurring',
  SHARED_MOVEMENTS: '@moflo_shared_movements',
  SHARED_RECURRING: '@moflo_shared_recurring',
};

export interface AnnualMonthData {
  month: number;
  income: number;
  expense: number;
  balance: number;
}

interface MovementStore {
  movements: Movement[];
  recurringMovements: RecurringMovement[];
  isLoading: boolean;
  selectedMonth: number;
  selectedYear: number;
  selectedAnnualYear: number;
  sharedAccountId: string | null;
  showRecurringModal: boolean;
  activeHistorialFilter: string;

  loadData: () => Promise<void>;
  loadSharedData: (accountId: string) => Promise<void>;
  saveMovements: (movements: Movement[]) => Promise<void>;
  saveRecurring: (recurring: RecurringMovement[]) => Promise<void>;

  addMovement: (movement: Movement) => Promise<void>;
  deleteMovement: (id: string) => Promise<void>;

  addRecurringMovement: (movement: RecurringMovement) => Promise<void>;
  deleteRecurringMovement: (id: string) => Promise<void>;
  applyRecurringMovements: () => Promise<void>;

  setSelectedMonth: (month: number, year: number) => void;
  setSelectedAnnualYear: (year: number) => void;
  setSharedAccountId: (id: string | null) => void;
  setShowRecurringModal: (show: boolean) => void;
  setActiveHistorialFilter: (filter: string) => void;
  resetStore: () => void;

  getMovementsForSelectedMonth: () => Movement[];
  getMonthlySummary: () => MonthlySummary;
  getRecentMovements: (limit?: number) => Movement[];
  getAnnualSummary: () => AnnualMonthData[];
}

const now = new Date();

const getSharedMovementsCol = (accountId: string) =>
  firestore().collection('sharedAccounts').doc(accountId).collection('movements');

const getSharedRecurringCol = (accountId: string) =>
  firestore().collection('sharedAccounts').doc(accountId).collection('recurring');

export const useMovementStore = create<MovementStore>((set, get) => ({
  movements: [],
  recurringMovements: [],
  isLoading: false,
  selectedMonth: now.getMonth() + 1,
  selectedYear: now.getFullYear(),
  selectedAnnualYear: now.getFullYear(),
  sharedAccountId: null,
  showRecurringModal: false,
  activeHistorialFilter: 'income',

  resetStore: () => set({
    movements: [],
    recurringMovements: [],
    isLoading: false,
    selectedMonth: new Date().getMonth() + 1,
    selectedYear: new Date().getFullYear(),
    selectedAnnualYear: new Date().getFullYear(),
    sharedAccountId: null,
    showRecurringModal: false,
  }),

  setSharedAccountId: (id) => set({ sharedAccountId: id }),
  setShowRecurringModal: (show) => set({ showRecurringModal: show }),
  setActiveHistorialFilter: (filter) => set({ activeHistorialFilter: filter }),

  // ── CARGAR DATOS INDIVIDUALES ──────────────────────────────────
  loadData: async () => {
    set({ isLoading: true });
    try {
      const [movementsRaw, recurringRaw] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.MOVEMENTS),
        AsyncStorage.getItem(STORAGE_KEYS.RECURRING),
      ]);
      set({
        movements: movementsRaw ? JSON.parse(movementsRaw) : [],
        recurringMovements: recurringRaw ? JSON.parse(recurringRaw) : [],
        sharedAccountId: null,
      });

      await processQueue();

      const netState = await NetInfo.fetch();
      if (netState.isConnected) {
        const [firestoreMovements, firestoreRecurring] = await Promise.all([
          fetchMovementsFromFirestore(),
          fetchRecurringFromFirestore(),
        ]);

        if (firestoreMovements.length > 0 || firestoreRecurring.length > 0) {
          set({
            movements: firestoreMovements,
            recurringMovements: firestoreRecurring,
          });
          await Promise.all([
            AsyncStorage.setItem(STORAGE_KEYS.MOVEMENTS, JSON.stringify(firestoreMovements)),
            AsyncStorage.setItem(STORAGE_KEYS.RECURRING, JSON.stringify(firestoreRecurring)),
          ]);
        }
      }
    } catch (e) {
      console.error('Error loading data:', e);
    } finally {
      set({ isLoading: false });
    }
  },

  // ── CARGAR DATOS COMPARTIDOS ───────────────────────────────────
  loadSharedData: async (accountId) => {
    set({ isLoading: true, sharedAccountId: accountId });
    try {
      const cachedMovements = await AsyncStorage.getItem(STORAGE_KEYS.SHARED_MOVEMENTS);
      const cachedRecurring = await AsyncStorage.getItem(STORAGE_KEYS.SHARED_RECURRING);
      if (cachedMovements) set({ movements: JSON.parse(cachedMovements) });
      if (cachedRecurring) set({ recurringMovements: JSON.parse(cachedRecurring) });

      await processQueue();

      const netState = await NetInfo.fetch();
      if (netState.isConnected) {
        const [movementsSnap, recurringSnap] = await Promise.all([
          getSharedMovementsCol(accountId).get(),
          getSharedRecurringCol(accountId).get(),
        ]);

        const movements = movementsSnap.docs
          .map(d => d.data() as Movement)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const recurring = recurringSnap.docs
          .map(d => d.data() as RecurringMovement)
          .sort((a, b) => a.recurringDay - b.recurringDay);

        set({ movements: [...movements], recurringMovements: [...recurring] });
        await Promise.all([
          AsyncStorage.setItem(STORAGE_KEYS.SHARED_MOVEMENTS, JSON.stringify(movements)),
          AsyncStorage.setItem(STORAGE_KEYS.SHARED_RECURRING, JSON.stringify(recurring)),
        ]);
      }
    } catch (e) {
      console.error('Error loading shared data:', e);
    } finally {
      set({ isLoading: false });
    }
  },

  // ── GUARDAR EN ASYNCSTORAGE ────────────────────────────────────
  saveMovements: async (movements) => {
    const { sharedAccountId } = get();
    const key = sharedAccountId ? STORAGE_KEYS.SHARED_MOVEMENTS : STORAGE_KEYS.MOVEMENTS;
    await AsyncStorage.setItem(key, JSON.stringify(movements));
  },

  saveRecurring: async (recurring) => {
    const { sharedAccountId } = get();
    const key = sharedAccountId ? STORAGE_KEYS.SHARED_RECURRING : STORAGE_KEYS.RECURRING;
    await AsyncStorage.setItem(key, JSON.stringify(recurring));
  },

  // ── AÑADIR MOVIMIENTO ──────────────────────────────────────────
  addMovement: async (movement) => {
    const { sharedAccountId } = get();

    if (sharedAccountId) {
      const newMovements = [movement, ...get().movements];
      set({ movements: [...newMovements] });
      await get().saveMovements(newMovements);

      const uid = auth().currentUser?.uid ?? '';
      const sharedMovement = { ...movement, addedBy: uid };
      const netState = await NetInfo.fetch();
      if (netState.isConnected) {
        try {
          await getSharedMovementsCol(sharedAccountId)
            .doc(movement.id)
            .set(sharedMovement);
        } catch (e) {
          await enqueue({
            type: 'ADD_SHARED_MOVEMENT',
            payload: sharedMovement,
            accountId: sharedAccountId,
          });
        }
      } else {
        await enqueue({
          type: 'ADD_SHARED_MOVEMENT',
          payload: sharedMovement,
          accountId: sharedAccountId,
        });
      }
      return;
    }

    const newMovements = [movement, ...get().movements];
    set({ movements: newMovements });
    await get().saveMovements(newMovements);

    const netState = await NetInfo.fetch();
    if (netState.isConnected) {
      try { await addMovementToFirestore(movement); }
      catch (e) { await enqueue({ type: 'ADD_MOVEMENT', payload: movement }); }
    } else {
      await enqueue({ type: 'ADD_MOVEMENT', payload: movement });
    }
  },

  // ── ELIMINAR MOVIMIENTO ────────────────────────────────────────
  deleteMovement: async (id) => {
    const { sharedAccountId } = get();

    if (sharedAccountId) {
      const updated = get().movements.filter(m => m.id !== id);
      set({ movements: [...updated] });
      await get().saveMovements(updated);

      const netState = await NetInfo.fetch();
      if (netState.isConnected) {
        try {
          await getSharedMovementsCol(sharedAccountId).doc(id).delete();
        } catch (e) {
          await enqueue({
            type: 'DELETE_SHARED_MOVEMENT',
            payload: id,
            accountId: sharedAccountId,
          });
        }
      } else {
        await enqueue({
          type: 'DELETE_SHARED_MOVEMENT',
          payload: id,
          accountId: sharedAccountId,
        });
      }
      return;
    }

    const newMovements = get().movements.filter(m => m.id !== id);
    set({ movements: newMovements });
    await get().saveMovements(newMovements);

    const netState = await NetInfo.fetch();
    if (netState.isConnected) {
      try { await deleteMovementFromFirestore(id); }
      catch (e) { await enqueue({ type: 'DELETE_MOVEMENT', payload: id }); }
    } else {
      await enqueue({ type: 'DELETE_MOVEMENT', payload: id });
    }
  },

  // ── AÑADIR RECURRENTE ──────────────────────────────────────────
  addRecurringMovement: async (movement) => {
    const { sharedAccountId } = get();

    if (sharedAccountId) {
      const newRecurring = [...get().recurringMovements, movement]
        .sort((a, b) => a.recurringDay - b.recurringDay);
      set({ recurringMovements: [...newRecurring] });
      await get().saveRecurring(newRecurring);

      const netState = await NetInfo.fetch();
      if (netState.isConnected) {
        try {
          await getSharedRecurringCol(sharedAccountId).doc(movement.id).set(movement);
        } catch (e) {
          await enqueue({
            type: 'ADD_SHARED_RECURRING',
            payload: movement,
            accountId: sharedAccountId,
          });
        }
      } else {
        await enqueue({
          type: 'ADD_SHARED_RECURRING',
          payload: movement,
          accountId: sharedAccountId,
        });
      }
      return;
    }

    const newRecurring = [movement, ...get().recurringMovements];
    set({ recurringMovements: newRecurring });
    await get().saveRecurring(newRecurring);

    const netState = await NetInfo.fetch();
    if (netState.isConnected) {
      try { await addRecurringToFirestore(movement); }
      catch (e) { await enqueue({ type: 'ADD_RECURRING', payload: movement }); }
    } else {
      await enqueue({ type: 'ADD_RECURRING', payload: movement });
    }
  },

  // ── ELIMINAR RECURRENTE ────────────────────────────────────────
  deleteRecurringMovement: async (id) => {
    const { sharedAccountId } = get();

    if (sharedAccountId) {
      const updated = get().recurringMovements.filter(m => m.id !== id);
      set({ recurringMovements: [...updated] });
      await get().saveRecurring(updated);

      const netState = await NetInfo.fetch();
      if (netState.isConnected) {
        try {
          await getSharedRecurringCol(sharedAccountId).doc(id).delete();
        } catch (e) {
          await enqueue({
            type: 'DELETE_SHARED_RECURRING',
            payload: id,
            accountId: sharedAccountId,
          });
        }
      } else {
        await enqueue({
          type: 'DELETE_SHARED_RECURRING',
          payload: id,
          accountId: sharedAccountId,
        });
      }
      return;
    }

    const newRecurring = get().recurringMovements.filter(m => m.id !== id);
    set({ recurringMovements: newRecurring });
    await get().saveRecurring(newRecurring);

    const netState = await NetInfo.fetch();
    if (netState.isConnected) {
      try { await deleteRecurringFromFirestore(id); }
      catch (e) { await enqueue({ type: 'DELETE_RECURRING', payload: id }); }
    } else {
      await enqueue({ type: 'DELETE_RECURRING', payload: id });
    }
  },

  // ── APLICAR RECURRENTES ────────────────────────────────────────
  applyRecurringMovements: async () => {
    const { sharedAccountId, recurringMovements, movements } = get();

    const now = new Date();
    const currentDay = now.getDate();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const newMovements: Movement[] = [];

    for (const recurring of recurringMovements) {
      if (!recurring.isActive) continue;
      if (currentDay < recurring.recurringDay) continue;

      const createdAt = new Date(recurring.createdAt);
      const createdInCurrentMonth =
        createdAt.getFullYear() === currentYear &&
        createdAt.getMonth() + 1 === currentMonth;
      if (createdInCurrentMonth && createdAt.getDate() > recurring.recurringDay) continue;

      const alreadyExists = movements.some(m =>
        m.isRecurring &&
        m.description === recurring.description &&
        m.amount === recurring.amount &&
        new Date(m.date).getMonth() + 1 === currentMonth &&
        new Date(m.date).getFullYear() === currentYear
      );

      if (!alreadyExists) {
        const day = Math.min(recurring.recurringDay, new Date(currentYear, currentMonth, 0).getDate());
        const date = new Date(currentYear, currentMonth - 1, day);
        newMovements.push({
          id: `recurring_${recurring.id}_${currentMonth}_${currentYear}`,
          type: recurring.type,
          amount: recurring.amount,
          category: recurring.category,
          description: recurring.description,
          date: date.toISOString(),
          isRecurring: true,
          recurringDay: recurring.recurringDay,
          currency: recurring.currency,
          createdAt: new Date().toISOString(),
        });
      }
    }

    if (newMovements.length > 0) {
      const allMovements = [...newMovements, ...movements];
      set({ movements: allMovements });
      await get().saveMovements(allMovements);

      if (sharedAccountId) {
        const uid = auth().currentUser?.uid ?? '';
        for (const m of newMovements) {
          try {
            await getSharedMovementsCol(sharedAccountId).doc(m.id).set({ ...m, addedBy: uid });
          } catch (e) {
            console.error('Error saving shared recurring movement:', e);
          }
        }
      } else {
        const netState = await NetInfo.fetch();
        for (const m of newMovements) {
          if (netState.isConnected) {
            try { await addMovementToFirestore(m); }
            catch (e) { await enqueue({ type: 'ADD_MOVEMENT', payload: m }); }
          } else {
            await enqueue({ type: 'ADD_MOVEMENT', payload: m });
          }
        }
      }
    }
  },

  setSelectedMonth: (month, year) => set({ selectedMonth: month, selectedYear: year }),
  setSelectedAnnualYear: (year) => set({ selectedAnnualYear: year }),

  getMovementsForSelectedMonth: () => {
    const { selectedMonth, selectedYear, movements } = get();
    return movements.filter(m => {
      const date = new Date(m.date);
      return date.getMonth() + 1 === selectedMonth && date.getFullYear() === selectedYear;
    });
  },

  getMonthlySummary: () => {
    const { selectedMonth, selectedYear } = get();
    const monthMovements = get().getMovementsForSelectedMonth();
    const totalIncome = monthMovements.filter(m => m.type === 'income').reduce((s, m) => s + m.amount, 0);
    const totalExpense = monthMovements.filter(m => m.type === 'expense').reduce((s, m) => s + m.amount, 0);
    return {
      totalIncome, totalExpense,
      balance: totalIncome - totalExpense,
      month: selectedMonth, year: selectedYear,
    };
  },

  getRecentMovements: (limit = 5) => {
    const { movements } = get();
    return [...movements]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit);
  },

  getAnnualSummary: (): AnnualMonthData[] => {
    const { selectedAnnualYear, movements } = get();
    return Array.from({ length: 12 }, (_, i): AnnualMonthData => {
      const month = i + 1;
      const monthMovements = movements.filter(m => {
        const date = new Date(m.date);
        return date.getMonth() + 1 === month && date.getFullYear() === selectedAnnualYear;
      });
      const income = monthMovements.filter(m => m.type === 'income').reduce((s, m) => s + m.amount, 0);
      const expense = monthMovements.filter(m => m.type === 'expense').reduce((s, m) => s + m.amount, 0);
      return { month, income, expense, balance: income - expense };
    });
  },
}));