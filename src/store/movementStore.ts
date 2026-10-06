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
  hasMovementsInFirestore,
  addSharedMovementToFirestore,
  deleteSharedMovementFromFirestore,
} from '../services/firebase/firestore.service';
import { cloudCollection, fetchCloudChanges, fromCloud } from '../services/firebase/cloudSync';
import { enqueue, processQueue } from '../services/syncQueue.service';
import { SHARED_CACHE, sharedCacheKey, readSharedCache } from './sharedCache';
import {
  PERSONAL, advanceMarks, advanceMarksAfterFullRead, graveyardOf, isFullCheckDue, markFullCheck, mergeChanges,
  withoutBuried,
} from './cloudCheck';

const STORAGE_KEYS = {
  MOVEMENTS: '@moflo_movements',
  RECURRING: '@moflo_recurring',
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
  /** De qué cuenta son los movimientos cargados (ver cloudCheck) */
  movementsOf: string | null;
  showRecurringModal: boolean;
  showMovementModal: boolean;
  activeHistorialFilter: string;

  /** fullCheck: bajar de la nube el historial entero aunque no toque (ver cloudCheck) */
  loadData: (options?: { fullCheck?: boolean }) => Promise<void>;
  loadSharedData: (accountId: string, options?: { fullCheck?: boolean }) => Promise<void>;
  /** Lo que trae la escucha de la compartida: lo cambiado y lo borrado. true si se ha juntado y guardado */
  applySharedChanges: (
    accountId: string, changed: Movement[], deleted: { id: string; updatedAt?: number }[],
  ) => Promise<boolean>;
  saveMovements: (movements: Movement[]) => Promise<void>;
  saveRecurring: (recurring: RecurringMovement[]) => Promise<void>;

  addMovement: (movement: Movement) => Promise<void>;
  updateMovement: (id: string, updates: Partial<Movement>) => Promise<void>;
  deleteMovement: (id: string) => Promise<void>;

  addRecurringMovement: (movement: RecurringMovement) => Promise<void>;
  updateRecurringMovement: (id: string, updates: Partial<RecurringMovement>) => Promise<void>;
  deleteRecurringMovement: (id: string) => Promise<void>;
  applyRecurringMovements: () => Promise<void>;

  setSelectedMonth: (month: number, year: number) => void;
  setSelectedAnnualYear: (year: number) => void;
  setSharedAccountId: (id: string | null) => void;
  setShowRecurringModal: (show: boolean) => void;
  setShowMovementModal: (show: boolean) => void;
  setActiveHistorialFilter: (filter: string) => void;
  resetStore: () => void;

  getMovementsForSelectedMonth: () => Movement[];
  getMonthlySummary: () => MonthlySummary;
  getRecentMovements: (limit?: number) => Movement[];
  getAnnualSummary: () => AnnualMonthData[];
}

const now = new Date();

const getSharedRecurringCol = (accountId: string) =>
  firestore().collection('sharedAccounts').doc(accountId).collection('recurring');

const stripUndefined = <T extends Record<string, any>>(obj: T): T =>
  Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined)) as T;

const byDate = (a: Movement, b: Movement) => new Date(b.date).getTime() - new Date(a.date).getTime();

// Meses hacia atrás que se recuperan como máximo si no se abrió la app
const MAX_RECURRING_CATCH_UP_MONTHS = 12;

export const useMovementStore = create<MovementStore>((set, get) => ({
  movements: [],
  recurringMovements: [],
  isLoading: false,
  selectedMonth: now.getMonth() + 1,
  selectedYear: now.getFullYear(),
  selectedAnnualYear: now.getFullYear(),
  sharedAccountId: null,
  movementsOf: null,
  showRecurringModal: false,
  showMovementModal: false,
  activeHistorialFilter: 'income',

  resetStore: () => set({
    movements: [],
    recurringMovements: [],
    isLoading: false,
    selectedMonth: new Date().getMonth() + 1,
    selectedYear: new Date().getFullYear(),
    selectedAnnualYear: new Date().getFullYear(),
    sharedAccountId: null,
    movementsOf: null,
    showRecurringModal: false,
    showMovementModal: false,
  }),

  setSharedAccountId: (id) => set({ sharedAccountId: id }),
  setShowRecurringModal: (show) => set({ showRecurringModal: show }),
  setShowMovementModal: (show) => set({ showMovementModal: show }),
  setActiveHistorialFilter: (filter) => set({ activeHistorialFilter: filter }),

  // ── CARGAR DATOS INDIVIDUALES ──────────────────────────────────
  // Los movimientos, de la copia del móvil, con lo que haya cambiado en la
  // nube desde la última vez (otro móvil); enteros, de vez en cuando o si se
  // pide (ver cloudCheck). Los fijos, siempre: son pocos, y uno viejo en el
  // móvil podría volver a generar sus movimientos
  loadData: async ({ fullCheck = false } = {}) => {
    set({ isLoading: true });
    try {
      const [movementsRaw, recurringRaw] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.MOVEMENTS),
        AsyncStorage.getItem(STORAGE_KEYS.RECURRING),
      ]);
      const localRecurring: RecurringMovement[] = recurringRaw ? JSON.parse(recurringRaw) : [];
      set({
        movements: movementsRaw ? JSON.parse(movementsRaw) : [],
        recurringMovements: localRecurring,
        sharedAccountId: null,
        movementsOf: PERSONAL,
      });

      await processQueue();

      const uid = auth().currentUser?.uid;
      const netState = await NetInfo.fetch();
      if (!uid || !netState.isConnected) return;

      const full = fullCheck || movementsRaw == null || await isFullCheckDue('movements', uid);
      const [cloudMovements, changes, cloudRecurring] = await Promise.all([
        full ? fetchMovementsFromFirestore() : Promise.resolve(null),
        full ? Promise.resolve(null) : fetchCloudChanges<Movement>(null, 'movements', uid),
        fetchRecurringFromFirestore(),
      ]);
      // Si entretanto se ha pasado a la compartida, solo se guarda la copia:
      // en pantalla pisaría los movimientos de la otra cuenta
      const onScreen = () => get().sharedAccountId === null && get().movementsOf === PERSONAL;

      if (cloudMovements) {
        // Solo con la respuesta del servidor: la de la caché de Firestore
        // puede estar incompleta
        if (!cloudMovements.fromServer || !cloudRecurring.fromServer) return;
        // Con la nube vacía no se borra nada del móvil
        if (cloudMovements.docs.length > 0 || cloudRecurring.docs.length > 0) {
          const movements = withoutBuried(cloudMovements.docs, graveyardOf('movements', uid));
          if (onScreen()) {
            set({ movements, recurringMovements: cloudRecurring.docs });
          }
          await Promise.all([
            AsyncStorage.setItem(STORAGE_KEYS.MOVEMENTS, JSON.stringify(movements)),
            AsyncStorage.setItem(STORAGE_KEYS.RECURRING, JSON.stringify(cloudRecurring.docs)),
          ]);
          await advanceMarksAfterFullRead('movements', uid, movements);
        } else if (movementsRaw == null) {
          // Sin nada en ningún sitio: la copia, vacía. Sin ella, cada inicio
          // volvería a bajarlo todo
          await AsyncStorage.setItem(STORAGE_KEYS.MOVEMENTS, '[]');
        }
        await markFullCheck('movements', uid);
        return;
      }

      // Lo cambiado desde la última vez, sobre la copia. Solo con la respuesta
      // del servidor: la de la caché de Firestore puede estar incompleta
      if (changes?.fromServer && (changes.changed.length > 0 || changes.deleted.length > 0)) {
        const base: Movement[] = onScreen()
          ? get().movements
          : JSON.parse((await AsyncStorage.getItem(STORAGE_KEYS.MOVEMENTS)) ?? '[]');
        const merged = mergeChanges(base, changes.changed, changes.deleted, graveyardOf('movements', uid));
        if (merged !== base) {
          const movements = merged.sort(byDate);
          if (onScreen()) set({ movements });
          await AsyncStorage.setItem(STORAGE_KEYS.MOVEMENTS, JSON.stringify(movements));
        }
        await advanceMarks('movements', uid, changes.changed, changes.deleted);
      }

      if (!cloudRecurring.fromServer) return;
      // Ningún fijo en la nube y alguno en el móvil: se quitan si la cuenta
      // tiene movimientos en la nube. Con la nube vacía, nada (como arriba)
      const keep = cloudRecurring.docs.length === 0
        && localRecurring.length > 0
        && (await hasMovementsInFirestore()) !== true;
      if (keep) return;
      if (onScreen()) set({ recurringMovements: cloudRecurring.docs });
      await AsyncStorage.setItem(STORAGE_KEYS.RECURRING, JSON.stringify(cloudRecurring.docs));
    } catch (e) {
      console.error('Error loading data:', e);
    } finally {
      set({ isLoading: false });
    }
  },

  // ── CARGAR DATOS COMPARTIDOS ───────────────────────────────────
  // De la nube, lo cambiado desde la última vez (después lo trae en directo
  // subscribeToSharedMovements); el historial entero, de vez en cuando o si se
  // pide (ver cloudCheck). Los fijos, siempre
  loadSharedData: async (accountId, { fullCheck = false } = {}) => {
    set({ isLoading: true, sharedAccountId: accountId });
    try {
      const cachedMovements = await readSharedCache(SHARED_CACHE.MOVEMENTS, accountId);
      const cachedRecurring = await readSharedCache(SHARED_CACHE.RECURRING, accountId);
      const localMovements: Movement[] = cachedMovements ? JSON.parse(cachedMovements) : [];
      // Sin copia de esta cuenta, vacío: si no, seguían los de la cuenta de antes
      set({
        movements: localMovements,
        recurringMovements: cachedRecurring ? JSON.parse(cachedRecurring) : [],
        movementsOf: accountId,
      });

      await processQueue();

      const netState = await NetInfo.fetch();
      if (netState.isConnected) {
        const full = fullCheck || cachedMovements == null || await isFullCheckDue('movements', accountId);
        const [fullSnap, changes, recurringSnap] = await Promise.all([
          full ? cloudCollection(accountId, 'movements').get() : Promise.resolve(null),
          full ? Promise.resolve(null) : fetchCloudChanges<Movement>(accountId, 'movements', accountId),
          getSharedRecurringCol(accountId).get(),
        ]);
        const recurring = recurringSnap.docs
          .map(d => d.data() as RecurringMovement)
          .sort((a, b) => a.recurringDay - b.recurringDay);

        // Si entretanto se ha cambiado de cuenta, solo se guarda la copia
        const onScreen = () => get().sharedAccountId === accountId && get().movementsOf === accountId;
        // Solo con la respuesta del servidor: la de la caché de Firestore puede
        // estar incompleta
        let movements: Movement[] | null = null;
        if (fullSnap && !fullSnap.metadata.fromCache) {
          movements = withoutBuried(fullSnap.docs.map(d => fromCloud<Movement>(d)), graveyardOf('movements', accountId));
        } else if (changes?.fromServer && (changes.changed.length > 0 || changes.deleted.length > 0)) {
          // Sobre lo que hay en pantalla, que ya puede traer cambios de la escucha
          const base: Movement[] = onScreen()
            ? get().movements
            : JSON.parse((await readSharedCache(SHARED_CACHE.MOVEMENTS, accountId)) ?? '[]');
          const merged = mergeChanges(base, changes.changed, changes.deleted, graveyardOf('movements', accountId));
          if (merged !== base) movements = merged;
        }
        movements?.sort(byDate);

        if (onScreen()) {
          set(movements ? { movements, recurringMovements: recurring } : { recurringMovements: recurring });
        }
        await Promise.all([
          movements
            ? AsyncStorage.setItem(sharedCacheKey(SHARED_CACHE.MOVEMENTS, accountId), JSON.stringify(movements))
            : null,
          AsyncStorage.setItem(sharedCacheKey(SHARED_CACHE.RECURRING, accountId), JSON.stringify(recurring)),
        ]);
        if (movements && fullSnap) {
          await advanceMarksAfterFullRead('movements', accountId, movements);
          await markFullCheck('movements', accountId);
        } else if (changes?.fromServer) {
          await advanceMarks('movements', accountId, changes.changed, changes.deleted);
        }
      }
    } catch (e) {
      console.error('Error loading shared data:', e);
    } finally {
      set({ isLoading: false });
    }
  },

  // Lo que trae la escucha de la cuenta compartida, junto con la copia. Quien
  // la llama sube la marca cuando ya está guardada
  applySharedChanges: async (accountId, changed, deleted) => {
    // Aún con los movimientos de la cuenta anterior (se está entrando en
    // esta): lo trae su carga, que viene detrás
    if (get().sharedAccountId !== accountId || get().movementsOf !== accountId) return false;
    const current = get().movements;
    const merged = mergeChanges(current, changed, deleted, graveyardOf('movements', accountId));
    if (merged === current) return true;
    const movements = merged.sort(byDate);
    set({ movements });
    await AsyncStorage.setItem(sharedCacheKey(SHARED_CACHE.MOVEMENTS, accountId), JSON.stringify(movements));
    return true;
  },

  // ── GUARDAR EN ASYNCSTORAGE ────────────────────────────────────
  saveMovements: async (movements) => {
    const { sharedAccountId } = get();
    const key = sharedAccountId ? sharedCacheKey(SHARED_CACHE.MOVEMENTS, sharedAccountId) : STORAGE_KEYS.MOVEMENTS;
    await AsyncStorage.setItem(key, JSON.stringify(movements));
  },

  saveRecurring: async (recurring) => {
    const { sharedAccountId } = get();
    const key = sharedAccountId ? sharedCacheKey(SHARED_CACHE.RECURRING, sharedAccountId) : STORAGE_KEYS.RECURRING;
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
      const sharedMovement = stripUndefined({ ...movement, addedBy: uid });
      const netState = await NetInfo.fetch();
      if (netState.isConnected) {
        try {
          await addSharedMovementToFirestore(sharedAccountId, sharedMovement);
        } catch {
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
      catch { await enqueue({ type: 'ADD_MOVEMENT', payload: movement }); }
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
          await deleteSharedMovementFromFirestore(sharedAccountId, id);
        } catch {
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
      catch { await enqueue({ type: 'DELETE_MOVEMENT', payload: id }); }
    } else {
      await enqueue({ type: 'DELETE_MOVEMENT', payload: id });
    }
  },

  // ── EDITAR MOVIMIENTO ──────────────────────────────────────────
  updateMovement: async (id, updates) => {
    const { sharedAccountId } = get();
    const existing = get().movements.find(m => m.id === id);
    if (!existing) return;
    // La fecha, el autor y la marca de recurrente no se tocan al editar:
    // editar una instancia no altera la regla fija que la generó.
    const updated: Movement = {
      ...existing,
      ...updates,
      id: existing.id,
      date: existing.date,
      createdAt: existing.createdAt,
    };

    const newMovements = get().movements.map(m => (m.id === id ? updated : m));
    set({ movements: [...newMovements] });
    await get().saveMovements(newMovements);

    if (sharedAccountId) {
      // Se conserva el autor original: editar no cambia quién lo creó
      const uid = auth().currentUser?.uid ?? '';
      const sharedMovement = stripUndefined({ ...updated, addedBy: updated.addedBy ?? uid });
      const netState = await NetInfo.fetch();
      if (netState.isConnected) {
        try {
          await addSharedMovementToFirestore(sharedAccountId, sharedMovement);
        } catch {
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

    const netState = await NetInfo.fetch();
    if (netState.isConnected) {
      try { await addMovementToFirestore(updated); }
      catch { await enqueue({ type: 'ADD_MOVEMENT', payload: updated }); }
    } else {
      await enqueue({ type: 'ADD_MOVEMENT', payload: updated });
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

      const sharedRecurring = stripUndefined({ ...movement });
      const netState = await NetInfo.fetch();
      if (netState.isConnected) {
        try {
          await getSharedRecurringCol(sharedAccountId).doc(movement.id).set(sharedRecurring);
        } catch {
          await enqueue({
            type: 'ADD_SHARED_RECURRING',
            payload: sharedRecurring,
            accountId: sharedAccountId,
          });
        }
      } else {
        await enqueue({
          type: 'ADD_SHARED_RECURRING',
          payload: sharedRecurring,
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
      catch { await enqueue({ type: 'ADD_RECURRING', payload: movement }); }
    } else {
      await enqueue({ type: 'ADD_RECURRING', payload: movement });
    }
  },

  // ── EDITAR RECURRENTE ──────────────────────────────────────────
  // Solo afecta a las generaciones futuras: las Movement ya creadas en
  // meses pasados (y la del mes actual si ya saltó) permanecen intactas.
  updateRecurringMovement: async (id, updates) => {
    const { sharedAccountId } = get();
    const existing = get().recurringMovements.find(m => m.id === id);
    if (!existing) return;
    const updated: RecurringMovement = { ...existing, ...updates, id: existing.id };

    const newRecurring = get().recurringMovements
      .map(m => (m.id === id ? updated : m))
      .sort((a, b) => a.recurringDay - b.recurringDay);
    set({ recurringMovements: [...newRecurring] });
    await get().saveRecurring(newRecurring);

    if (sharedAccountId) {
      const sharedRecurring = stripUndefined({ ...updated });
      const netState = await NetInfo.fetch();
      if (netState.isConnected) {
        try {
          await getSharedRecurringCol(sharedAccountId).doc(id).set(sharedRecurring);
        } catch {
          await enqueue({
            type: 'ADD_SHARED_RECURRING',
            payload: sharedRecurring,
            accountId: sharedAccountId,
          });
        }
      } else {
        await enqueue({
          type: 'ADD_SHARED_RECURRING',
          payload: sharedRecurring,
          accountId: sharedAccountId,
        });
      }
      return;
    }

    const netState = await NetInfo.fetch();
    if (netState.isConnected) {
      try { await addRecurringToFirestore(updated); }
      catch { await enqueue({ type: 'ADD_RECURRING', payload: updated }); }
    } else {
      await enqueue({ type: 'ADD_RECURRING', payload: updated });
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
        } catch {
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
      catch { await enqueue({ type: 'DELETE_RECURRING', payload: id }); }
    } else {
      await enqueue({ type: 'DELETE_RECURRING', payload: id });
    }
  },

  // ── APLICAR RECURRENTES ────────────────────────────────────────
  // Genera los movimientos de los meses cuyo día de cargo ya ha llegado, incluidos los
  // meses en los que no se abrió la app. `lastAppliedMonth` guarda el último mes revisado
  // de cada recurrente para no volver a generar un movimiento que el usuario haya borrado.
  applyRecurringMovements: async () => {
    const { sharedAccountId, recurringMovements, movements } = get();

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const currentIndex = now.getFullYear() * 12 + now.getMonth();
    const newMovements: Movement[] = [];
    const lastAppliedUpdates = new Map<string, string>();

    for (const recurring of recurringMovements) {
      if (!recurring.isActive) continue;

      const createdAt = new Date(recurring.createdAt);
      const createdDay = new Date(
        createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate(),
      ).getTime();

      // Sin registro (recurrentes anteriores a este cambio): solo el mes actual, como antes
      let startIndex = currentIndex;
      const [appliedYear, appliedMonth] = (recurring.lastAppliedMonth ?? '').split('-').map(Number);
      if (appliedYear && appliedMonth) startIndex = appliedYear * 12 + appliedMonth; // mes siguiente
      startIndex = Math.max(startIndex, currentIndex - (MAX_RECURRING_CATCH_UP_MONTHS - 1));

      let lastReviewedIndex = currentIndex - 1;
      for (let index = startIndex; index <= currentIndex; index++) {
        const year = Math.floor(index / 12);
        const monthIdx = index % 12;
        // Días 29-31 en meses más cortos: se cobra el último día del mes
        const day = Math.min(recurring.recurringDay, new Date(year, monthIdx + 1, 0).getDate());
        const date = new Date(year, monthIdx, day);
        if (date.getTime() > today) break; // aún no ha llegado el día de cargo
        lastReviewedIndex = index;
        if (date.getTime() < createdDay) continue; // creado después del cargo de ese mes

        const month = monthIdx + 1;
        const expectedId = `recurring_${recurring.id}_${month}_${year}`;
        const alreadyExists = movements.some(m =>
          m.id === expectedId ||
          (m.isRecurring &&
            m.description === recurring.description &&
            m.amount === recurring.amount &&
            new Date(m.date).getMonth() === monthIdx &&
            new Date(m.date).getFullYear() === year)
        );
        if (alreadyExists) continue;

        newMovements.push({
          id: expectedId,
          type: recurring.type,
          amount: recurring.amount,
          category: recurring.category,
          description: recurring.description,
          // A las 12:00 y no a las 00:00: así un cambio de zona horaria (viajes) no lo
          // mueve al día o mes anterior. La comprobación del día de cargo sigue siendo por días.
          date: new Date(year, monthIdx, day, 12).toISOString(),
          isRecurring: true,
          recurringDay: recurring.recurringDay,
          currency: recurring.currency,
          note: recurring.note,
          createdAt: new Date().toISOString(),
        });
      }

      const reviewedMonth = `${Math.floor(lastReviewedIndex / 12)}-${String(lastReviewedIndex % 12 + 1).padStart(2, '0')}`;
      if (lastReviewedIndex >= startIndex - 1 && reviewedMonth !== recurring.lastAppliedMonth) {
        lastAppliedUpdates.set(recurring.id, reviewedMonth);
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
            await addSharedMovementToFirestore(sharedAccountId, { ...m, addedBy: uid });
          } catch (e) {
            console.error('Error saving shared recurring movement:', e);
          }
        }
      } else {
        const netState = await NetInfo.fetch();
        for (const m of newMovements) {
          if (netState.isConnected) {
            try { await addMovementToFirestore(m); }
            catch { await enqueue({ type: 'ADD_MOVEMENT', payload: m }); }
          } else {
            await enqueue({ type: 'ADD_MOVEMENT', payload: m });
          }
        }
      }
    }

    // Si mientras tanto se cambió de cuenta, no mezclar los recurrentes
    if (lastAppliedUpdates.size > 0 && get().sharedAccountId === sharedAccountId) {
      const updatedRecurring = get().recurringMovements.map(r => {
        const month = lastAppliedUpdates.get(r.id);
        return month ? { ...r, lastAppliedMonth: month } : r;
      });
      set({ recurringMovements: updatedRecurring });
      await get().saveRecurring(updatedRecurring);

      const uid = auth().currentUser?.uid;
      const col = sharedAccountId
        ? getSharedRecurringCol(sharedAccountId)
        : uid ? firestore().collection('users').doc(uid).collection('recurring') : null;
      // update (no set): si el recurrente se ha borrado no se vuelve a crear.
      // Sin await: con mala conexión no bloquea el arranque.
      lastAppliedUpdates.forEach((month, id) => {
        col?.doc(id).update({ lastAppliedMonth: month }).catch(() => {});
      });
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