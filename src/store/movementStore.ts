import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
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
};

export interface AnnualMonthData {
  month: number;
  income: number;
  expense: number;
  saving: number;
  balance: number;
}

interface MovementStore {
  movements: Movement[];
  recurringMovements: RecurringMovement[];
  isLoading: boolean;
  selectedMonth: number;
  selectedYear: number;
  selectedAnnualYear: number;

  loadData: () => Promise<void>;
  saveMovements: (movements: Movement[]) => Promise<void>;
  saveRecurring: (recurring: RecurringMovement[]) => Promise<void>;

  addMovement: (movement: Movement) => Promise<void>;
  deleteMovement: (id: string) => Promise<void>;

  addRecurringMovement: (movement: RecurringMovement) => Promise<void>;
  deleteRecurringMovement: (id: string) => Promise<void>;
  applyRecurringMovements: () => Promise<void>;

  setSelectedMonth: (month: number, year: number) => void;
  setSelectedAnnualYear: (year: number) => void;
  resetStore: () => void;

  getMovementsForSelectedMonth: () => Movement[];
  getMonthlySummary: () => MonthlySummary;
  getRecentMovements: (limit?: number) => Movement[];
  getAnnualSummary: () => AnnualMonthData[];
}

const now = new Date();

const initialState = {
  movements: [],
  recurringMovements: [],
  isLoading: false,
  selectedMonth: now.getMonth() + 1,
  selectedYear: now.getFullYear(),
  selectedAnnualYear: now.getFullYear(),
};

export const useMovementStore = create<MovementStore>((set, get) => ({
  ...initialState,

  // ── RESET ──────────────────────────────────────────────────────
  resetStore: () => set({
    movements: [],
    recurringMovements: [],
    isLoading: false,
    selectedMonth: new Date().getMonth() + 1,
    selectedYear: new Date().getFullYear(),
    selectedAnnualYear: new Date().getFullYear(),
  }),

  // ── CARGAR DATOS ───────────────────────────────────────────────
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
            AsyncStorage.setItem(
              STORAGE_KEYS.MOVEMENTS,
              JSON.stringify(firestoreMovements)
            ),
            AsyncStorage.setItem(
              STORAGE_KEYS.RECURRING,
              JSON.stringify(firestoreRecurring)
            ),
          ]);
        }
      }
    } catch (e) {
      console.error('Error loading data:', e);
    } finally {
      set({ isLoading: false });
    }
  },

  // ── GUARDAR EN ASYNCSTORAGE ────────────────────────────────────
  saveMovements: async (movements) => {
    await AsyncStorage.setItem(
      STORAGE_KEYS.MOVEMENTS,
      JSON.stringify(movements)
    );
  },

  saveRecurring: async (recurring) => {
    await AsyncStorage.setItem(
      STORAGE_KEYS.RECURRING,
      JSON.stringify(recurring)
    );
  },

  // ── AÑADIR MOVIMIENTO ──────────────────────────────────────────
  addMovement: async (movement) => {
    const newMovements = [movement, ...get().movements];
    set({ movements: newMovements });
    await get().saveMovements(newMovements);

    const netState = await NetInfo.fetch();
    if (netState.isConnected) {
      try {
        await addMovementToFirestore(movement);
      } catch (e) {
        await enqueue({ type: 'ADD_MOVEMENT', payload: movement });
      }
    } else {
      await enqueue({ type: 'ADD_MOVEMENT', payload: movement });
    }
  },

  // ── ELIMINAR MOVIMIENTO ────────────────────────────────────────
  deleteMovement: async (id) => {
    const newMovements = get().movements.filter((m) => m.id !== id);
    set({ movements: newMovements });
    await get().saveMovements(newMovements);

    const netState = await NetInfo.fetch();
    if (netState.isConnected) {
      try {
        await deleteMovementFromFirestore(id);
      } catch (e) {
        await enqueue({ type: 'DELETE_MOVEMENT', payload: id });
      }
    } else {
      await enqueue({ type: 'DELETE_MOVEMENT', payload: id });
    }
  },

  // ── AÑADIR RECURRENTE ──────────────────────────────────────────
  addRecurringMovement: async (movement) => {
    const newRecurring = [movement, ...get().recurringMovements];
    set({ recurringMovements: newRecurring });
    await get().saveRecurring(newRecurring);

    const netState = await NetInfo.fetch();
    if (netState.isConnected) {
      try {
        await addRecurringToFirestore(movement);
      } catch (e) {
        await enqueue({ type: 'ADD_RECURRING', payload: movement });
      }
    } else {
      await enqueue({ type: 'ADD_RECURRING', payload: movement });
    }
  },

  // ── ELIMINAR RECURRENTE ────────────────────────────────────────
  deleteRecurringMovement: async (id) => {
    const newRecurring = get().recurringMovements.filter((m) => m.id !== id);
    set({ recurringMovements: newRecurring });
    await get().saveRecurring(newRecurring);

    const netState = await NetInfo.fetch();
    if (netState.isConnected) {
      try {
        await deleteRecurringFromFirestore(id);
      } catch (e) {
        await enqueue({ type: 'DELETE_RECURRING', payload: id });
      }
    } else {
      await enqueue({ type: 'DELETE_RECURRING', payload: id });
    }
  },

  // ── APLICAR RECURRENTES ────────────────────────────────────────
  applyRecurringMovements: async () => {
    const { recurringMovements, movements } = get();
    const now = new Date();
    const currentDay = now.getDate();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const newMovements: Movement[] = [];

    for (const recurring of recurringMovements) {
      if (!recurring.isActive) continue;

      // ✅ Solo aplica si hoy es igual o posterior al día configurado
      if (currentDay < recurring.recurringDay) continue;

      const alreadyExists = movements.some(
        (m) =>
          m.isRecurring &&
          m.description === recurring.description &&
          m.amount === recurring.amount &&
          new Date(m.date).getMonth() + 1 === currentMonth &&
          new Date(m.date).getFullYear() === currentYear
      );

      if (!alreadyExists) {
        const day = Math.min(
          recurring.recurringDay,
          new Date(currentYear, currentMonth, 0).getDate()
        );
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

      const netState = await NetInfo.fetch();
      for (const m of newMovements) {
        if (netState.isConnected) {
          try {
            await addMovementToFirestore(m);
          } catch (e) {
            await enqueue({ type: 'ADD_MOVEMENT', payload: m });
          }
        } else {
          await enqueue({ type: 'ADD_MOVEMENT', payload: m });
        }
      }
    }
  },

  // ── NAVEGACIÓN ─────────────────────────────────────────────────
  setSelectedMonth: (month, year) =>
    set({ selectedMonth: month, selectedYear: year }),

  setSelectedAnnualYear: (year) => set({ selectedAnnualYear: year }),

  // ── SELECTORES ─────────────────────────────────────────────────
  getMovementsForSelectedMonth: () => {
    const { movements, selectedMonth, selectedYear } = get();
    return movements.filter((m) => {
      const date = new Date(m.date);
      return (
        date.getMonth() + 1 === selectedMonth &&
        date.getFullYear() === selectedYear
      );
    });
  },

  getMonthlySummary: () => {
    const { selectedMonth, selectedYear } = get();
    const monthMovements = get().getMovementsForSelectedMonth();

    const totalIncome = monthMovements
      .filter((m) => m.type === 'income')
      .reduce((sum, m) => sum + m.amount, 0);

    const totalExpense = monthMovements
      .filter((m) => m.type === 'expense')
      .reduce((sum, m) => sum + m.amount, 0);

    const totalSavings = monthMovements
      .filter((m) => m.type === 'saving')
      .reduce((sum, m) => sum + m.amount, 0);

    return {
      totalIncome,
      totalExpense,
      totalSavings,
      balance: totalIncome - totalExpense - totalSavings,
      month: selectedMonth,
      year: selectedYear,
    };
  },

  getRecentMovements: (limit = 5) => {
    const { movements } = get();
    return [...movements]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit);
  },

  getAnnualSummary: () => {
    const { movements, selectedAnnualYear } = get();
    const monthsData: AnnualMonthData[] = [];

    for (let month = 1; month <= 12; month++) {
      const monthMovements = movements.filter((m) => {
        const date = new Date(m.date);
        return (
          date.getMonth() + 1 === month &&
          date.getFullYear() === selectedAnnualYear
        );
      });

      const income = monthMovements
        .filter((m) => m.type === 'income')
        .reduce((sum, m) => sum + m.amount, 0);

      const expense = monthMovements
        .filter((m) => m.type === 'expense')
        .reduce((sum, m) => sum + m.amount, 0);

      const saving = monthMovements
        .filter((m) => m.type === 'saving')
        .reduce((sum, m) => sum + m.amount, 0);

      monthsData.push({
        month,
        income,
        expense,
        saving,
        balance: income - expense - saving,
      });
    }

    return monthsData;
  },
}));