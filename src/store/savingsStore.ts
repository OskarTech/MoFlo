import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import { Hucha, HuchaMovement, HuchaMovementType } from '../types';
import { maybePromptForRating } from '../utils/rateAppPrompt';
import { useMovementStore } from './movementStore';
import { reportError } from '../services/crashReporting';
import { deleteRefsInChunks } from '../services/firebase/batchDelete';
import {
  clampDayToMonth,
  planAutomaticContributions,
  ContributionCandidate,
} from '../utils/automaticContributions';

const STORAGE_KEY = '@moflo_huchas';
const SHARED_STORAGE_KEY = '@moflo_shared_huchas';
const MOV_STORAGE_KEY = '@moflo_hucha_movements';
const SHARED_MOV_STORAGE_KEY = '@moflo_shared_hucha_movements';

let unsubscribeShared: (() => void) | null = null;
let unsubscribeSharedMovements: (() => void) | null = null;
// Cuenta que escucha cada listener, para no recrearlos si ya apuntan donde toca
let subscribedHuchasAccountId: string | null = null;
let subscribedHuchaMovementsAccountId: string | null = null;

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

// Computes the next ISO date for a given day-of-month (1-31).
// If today is before the chosen day, it lands on this month; otherwise next month.
const computeNextContributionDate = (recurringDay: number, from: Date = new Date()): string => {
  const day = Math.max(1, Math.min(31, Math.round(recurringDay)));
  let year = from.getFullYear();
  let monthIdx = from.getMonth();
  if (from.getDate() >= day) monthIdx += 1;
  const actualDay = clampDayToMonth(year, monthIdx, day);
  // 12:00 instead of 00:00 so a time zone change doesn't shift it to the previous day/month
  return new Date(year, monthIdx, actualDay, 12).toISOString();
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
  createHucha: (data: Omit<Hucha, 'id' | 'createdAt'> & { currentAmount?: number }) => Promise<void>;
  updateHucha: (id: string, data: Partial<Hucha>) => Promise<void>;
  addToHucha: (huchaId: string, amount: number, type?: HuchaMovementType) => Promise<void>;
  deleteHucha: (id: string) => Promise<void>;
  closeHucha: (id: string) => Promise<void>;
  reopenHucha: (id: string) => Promise<void>;
  applyAutomaticContributions: () => Promise<void>;
  subscribeToSharedHuchas: (accountId: string) => void;
  unsubscribeSharedHuchas: () => void;
  subscribeToSharedHuchaMovements: (accountId: string) => void;
  unsubscribeSharedHuchaMovements: () => void;
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
    get().huchas
      .filter(h => !h.closedAt && h.targetAmount > 0)
      .reduce((acc, h) => acc + h.targetAmount, 0),

  getAvailableBalance: () => {
    const movements = useMovementStore.getState().movements;
    let total = 0;
    for (const m of movements) {
      total += m.type === 'income' ? m.amount : -m.amount;
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

    const initialAmount = typeof data.currentAmount === 'number' && data.currentAmount > 0
      ? data.currentAmount
      : 0;

    const hucha: Hucha = {
      ...data,
      id,
      currentAmount: initialAmount,
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
        // Primero en local: esperando a Firestore, sin conexión la hucha no
        // aparecía hasta recuperarla y era fácil crearla dos veces. Firestore
        // guarda la escritura y la sube solo cuando vuelve la conexión.
        const updated = [hucha, ...get().huchas];
        set({ huchas: updated });
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        if (updated.length === 2) {
          setTimeout(() => maybePromptForRating('second_hucha'), 600);
        }
        await getUserHuchasCol().doc(id).set(firestoreData);
      }
    } catch (e) {
      console.error('Error creating hucha:', e);
      // Firestore la ha rechazado: se quita para no enseñar una hucha que no existe
      if (!sharedAccountId) {
        const remaining = get().huchas.filter(h => h.id !== id);
        set({ huchas: remaining });
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(remaining)).catch(() => {});
      }
    }
  },

  updateHucha: async (id, data) => {
    const { sharedAccountId, huchas } = get();
    const updated = huchas.map(h => h.id === id ? { ...h, ...data } : h);
    set({ huchas: updated });
    const key = sharedAccountId ? SHARED_STORAGE_KEY : STORAGE_KEY;
    await AsyncStorage.setItem(key, JSON.stringify(updated));
    // Never write currentAmount through this path — it's mutated only by
    // addToHucha/applyAutomaticContributions via FieldValue.increment so that
    // offline edits don't clobber concurrent deposits from other members.
    const { currentAmount: _omitCurrentAmount, ...safeData } = data;
    const firestoreData = Object.fromEntries(
      Object.entries(safeData).filter(([, v]) => v !== undefined)
    ) as Record<string, unknown>;
    if (Object.keys(firestoreData).length === 0) return;
    // Sin await: el cambio ya está en local y Firestore lo guarda y lo sube solo
    // al recuperar la conexión. Esperándolo, sin internet el modal de edición se
    // quedaba cargando hasta que volvía la conexión.
    try {
      const ref = sharedAccountId
        ? getSharedHuchasCol(sharedAccountId).doc(id)
        : getUserHuchasCol().doc(id);
      ref.set(firestoreData, { merge: true }).catch((e) => {
        console.error('Error updating hucha:', e);
      });
    } catch (e) {
      console.error('Error updating hucha:', e);
    }
  },

  addToHucha: async (huchaId, amount, type = 'deposit') => {
    const { sharedAccountId, huchas } = get();
    const hucha = huchas.find(h => h.id === huchaId);
    if (!hucha) return;


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
    const uid = auth().currentUser?.uid;
    const huchaMovement: HuchaMovement = {
      id: movId,
      huchaId,
      huchaName: hucha.name,
      huchaColor: hucha.color,
      type,
      amount,
      date: now,
      createdAt: now,
      ...(uid ? { addedBy: uid } : {}),
    };

    const updatedMovements = [huchaMovement, ...get().huchaMovements];
    set({ huchaMovements: updatedMovements });
    const movKey = sharedAccountId ? SHARED_MOV_STORAGE_KEY : MOV_STORAGE_KEY;
    await AsyncStorage.setItem(movKey, JSON.stringify(updatedMovements));

    try {
      const huchasCol = sharedAccountId
        ? getSharedHuchasCol(sharedAccountId)
        : getUserHuchasCol();
      // Use atomic increment so concurrent writes (e.g. another member adding
      // money while this device was offline) are summed by the server instead
      // of overwritten with the stale local value.
      const delta = type === 'deposit' ? amount : -amount;

      const movementsCol = sharedAccountId
        ? getSharedMovementsCol(sharedAccountId)
        : getUserMovementsCol();

      // En un solo lote: el importe y su apunte en el historial se guardan juntos
      // o ninguno. Con dos escrituras seguidas, si la app se cerraba entre ambas
      // sin conexión, el importe subía pero el depósito no salía en el historial.
      const batch = firestore().batch();
      batch.set(
        huchasCol.doc(huchaId),
        { currentAmount: firestore.FieldValue.increment(delta) },
        { merge: true }
      );
      batch.set(movementsCol.doc(movId), huchaMovement);
      await batch.commit();
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
      const huchaRef = sharedAccountId
        ? getSharedHuchasCol(sharedAccountId).doc(id)
        : getUserHuchasCol().doc(id);
      const movementsCol = sharedAccountId
        ? getSharedMovementsCol(sharedAccountId)
        : getUserMovementsCol();

      // Primero se buscan sus apuntes y después se borra todo junto, con la
      // hucha al final. Antes se borraba la hucha y luego se buscaban: si la app
      // se cerraba entre medias sin conexión, los apuntes quedaban sueltos en el
      // historial. Si la búsqueda falla, al menos se borra la hucha, como antes.
      let movementRefs: typeof huchaRef[] = [];
      try {
        const movSnap = await movementsCol.where('huchaId', '==', id).get();
        movementRefs = movSnap.docs.map(d => d.ref);
      } catch (e) {
        console.error('Error finding hucha movements:', e);
      }

      // En lotes de 450, por si una hucha muy antigua acumula más de 500
      // movimientos. La hucha va en el último: si un lote falla, sigue en pie
      // y el borrado se puede repetir.
      await deleteRefsInChunks([...movementRefs, huchaRef]);
    } catch (e) {
      console.error('Error deleting hucha:', e);
    }
  },

  closeHucha: async (id) => {
    const { sharedAccountId, huchas } = get();
    const closedAt = new Date().toISOString();
    const updated = huchas.map(h => h.id === id ? {
      ...h,
      closedAt,
      isAutomatic: false,
      monthlyAmount: undefined,
      recurringDay: undefined,
      nextContributionDate: undefined,
    } : h);
    set({ huchas: updated });
    const key = sharedAccountId ? SHARED_STORAGE_KEY : STORAGE_KEY;
    await AsyncStorage.setItem(key, JSON.stringify(updated));
    try {
      const ref = sharedAccountId
        ? getSharedHuchasCol(sharedAccountId).doc(id)
        : getUserHuchasCol().doc(id);
      await ref.set({
        closedAt,
        isAutomatic: false,
        monthlyAmount: firestore.FieldValue.delete(),
        recurringDay: firestore.FieldValue.delete(),
        nextContributionDate: firestore.FieldValue.delete(),
      } as any, { merge: true });
    } catch (e) {
      console.error('Error closing hucha:', e);
    }
  },

  reopenHucha: async (id) => {
    const { sharedAccountId, huchas } = get();
    const updated = huchas.map(h => {
      if (h.id !== id) return h;
      const { closedAt: _omit, ...rest } = h;
      return rest as Hucha;
    });
    set({ huchas: updated });
    const key = sharedAccountId ? SHARED_STORAGE_KEY : STORAGE_KEY;
    await AsyncStorage.setItem(key, JSON.stringify(updated));
    try {
      const ref = sharedAccountId
        ? getSharedHuchasCol(sharedAccountId).doc(id)
        : getUserHuchasCol().doc(id);
      await ref.set({
        closedAt: firestore.FieldValue.delete(),
      } as any, { merge: true });
    } catch (e) {
      console.error('Error reopening hucha:', e);
    }
  },

  applyAutomaticContributions: async () => {
    const { huchas, sharedAccountId } = get();
    const existingMovementIds = new Set(get().huchaMovements.map(m => m.id));

    // Todos los meses vencidos de cada hucha, en orden (antes, uno por arranque)
    const candidates = planAutomaticContributions(huchas, existingMovementIds, new Date());
    if (candidates.length === 0) return;

    // Agrupadas por hucha, manteniendo el orden de los meses
    const byHucha = new Map<string, ContributionCandidate[]>();
    for (const c of candidates) {
      const list = byHucha.get(c.huchaId) ?? [];
      list.push(c);
      byHucha.set(c.huchaId, list);
    }

    // Optimistic local update — UI feels instant; the snapshot listener will
    // reconcile with server state if any transaction below fails.
    const updatedHuchas = huchas.map(h => {
      const list = byHucha.get(h.id);
      if (!list) return h;
      const total = list.reduce((acc, c) => acc + c.contribution, 0);
      return {
        ...h,
        currentAmount: h.currentAmount + total,
        nextContributionDate: list[list.length - 1].nextDate,
      };
    });
    set({ huchas: updatedHuchas });
    const key = sharedAccountId ? SHARED_STORAGE_KEY : STORAGE_KEY;
    await AsyncStorage.setItem(key, JSON.stringify(updatedHuchas));

    const newMovements = candidates.map(c => c.movement);
    const allMovements = [...newMovements, ...get().huchaMovements];
    set({ huchaMovements: allMovements });
    const movKey = sharedAccountId ? SHARED_MOV_STORAGE_KEY : MOV_STORAGE_KEY;
    await AsyncStorage.setItem(movKey, JSON.stringify(allMovements));

    const huchasCol = sharedAccountId ? getSharedHuchasCol(sharedAccountId) : getUserHuchasCol();
    const movementsCol = sharedAccountId ? getSharedMovementsCol(sharedAccountId) : getUserMovementsCol();

    // Apply each contribution in a Firestore transaction. The movement doc
    // acts as the lock: if it already exists (another member already applied
    // this period), we skip the write so currentAmount isn't double-incremented.
    // Huchas in parallel; the months of one hucha in order, because each one
    // moves nextContributionDate forward. If a month fails, the later ones are
    // left for the next launch so the date never skips a pending month.
    await Promise.all([...byHucha.values()].map(async (list) => {
      for (const c of list) {
        try {
          const huchaRef = huchasCol.doc(c.huchaId);
          const movRef = movementsCol.doc(c.movement.id);
          await firestore().runTransaction(async (tx) => {
            const movSnap = await tx.get(movRef);
            if (movSnap.exists()) return;
            tx.set(movRef, c.movement);
            tx.set(huchaRef, {
              currentAmount: firestore.FieldValue.increment(c.contribution),
              nextContributionDate: c.nextDate,
            }, { merge: true });
          });
        } catch (e) {
          console.error('Error applying automatic contribution:', e);
          break;
        }
      }
    }));
  },

  subscribeToSharedHuchas: (accountId) => {
    get().subscribeToSharedHuchaMovements(accountId);

    // Ya se escucha esta cuenta: recrear el listener solo servía para volver a
    // leer la colección entera cada vez que la app pasaba a primer plano
    if (subscribedHuchasAccountId === accountId && unsubscribeShared) return;

    if (unsubscribeShared) { unsubscribeShared(); unsubscribeShared = null; }
    subscribedHuchasAccountId = accountId;

    const sub = getSharedHuchasCol(accountId)
      .orderBy('createdAt', 'desc')
      .onSnapshot((snap) => {
        if (subscribedHuchasAccountId !== accountId) return;
        const huchas = snap.docs.map(d => ({ id: d.id, ...d.data() } as Hucha));
        set({ huchas });
        AsyncStorage.setItem(SHARED_STORAGE_KEY, JSON.stringify(huchas));
      }, (e) => {
        reportError(e, 'listener de huchas compartidas');
        // Firestore cierra el listener tras un error: permitir resuscribirse
        if (unsubscribeShared === sub) {
          unsubscribeShared = null;
          subscribedHuchasAccountId = null;
        }
      });
    unsubscribeShared = sub;
  },

  unsubscribeSharedHuchas: () => {
    if (unsubscribeShared) { unsubscribeShared(); unsubscribeShared = null; }
    subscribedHuchasAccountId = null;
    get().unsubscribeSharedHuchaMovements();
  },

  subscribeToSharedHuchaMovements: (accountId) => {
    if (subscribedHuchaMovementsAccountId === accountId && unsubscribeSharedMovements) return;

    if (unsubscribeSharedMovements) { unsubscribeSharedMovements(); unsubscribeSharedMovements = null; }
    subscribedHuchaMovementsAccountId = accountId;

    const sub = getSharedMovementsCol(accountId)
      .orderBy('createdAt', 'desc')
      .onSnapshot((snap) => {
        if (subscribedHuchaMovementsAccountId !== accountId) return;
        const movements = snap.docs.map(d => ({ id: d.id, ...d.data() } as HuchaMovement));
        set({ huchaMovements: movements });
        AsyncStorage.setItem(SHARED_MOV_STORAGE_KEY, JSON.stringify(movements));
      }, (e) => {
        reportError(e, 'listener de movimientos de huchas compartidas');
        if (unsubscribeSharedMovements === sub) {
          unsubscribeSharedMovements = null;
          subscribedHuchaMovementsAccountId = null;
        }
      });
    unsubscribeSharedMovements = sub;
  },

  unsubscribeSharedHuchaMovements: () => {
    if (unsubscribeSharedMovements) { unsubscribeSharedMovements(); unsubscribeSharedMovements = null; }
    subscribedHuchaMovementsAccountId = null;
  },

  resetStore: () => {
    if (unsubscribeShared) { unsubscribeShared(); unsubscribeShared = null; }
    if (unsubscribeSharedMovements) { unsubscribeSharedMovements(); unsubscribeSharedMovements = null; }
    subscribedHuchasAccountId = null;
    subscribedHuchaMovementsAccountId = null;
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
