import { create } from 'zustand';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import i18n from '../../i18n';
import { reportError } from '../../services/crashReporting';
import { deleteRefsInChunks } from '../../services/firebase/batchDelete';
import { fromCloud } from '../../services/firebase/cloudSync';
import { RELISTEN_AFTER_MS } from '../../store/cloudCheck';
import { useSettingsStore } from '../../store/settingsStore';
import { businessAllowed } from '../access';
import {
  Business, BusinessChange, BusinessConfig, BusinessDay, BusinessExpense, BusinessJoinRequest,
  BusinessRecurring, ChangeAction, ChangeKind, ConfigItem, ConfigListKind, DayEntry,
  MAX_BUSINESS_MEMBERS, PendingBusinessRequest,
} from '../types';
import { businessDayOf, cents, dayIdOfDate, monthKeyOfDay, newId, shiftDayId, yearOfDay } from '../logic/basics';
import { isPosEntry } from '../logic/days';
import { commissionExpenseId, dayCommissions } from '../logic/commissions';
import { dueRecurringExpenses, existingRecurringKeys } from '../logic/recurring';
import { buildConfig, COMMISSIONS_TYPE } from '../templates';
import {
  BizCollection, BUSINESS_SUBCOLLECTIONS, bizCol, businessCodeRef, businessRef, businessesCol,
  configRef, deepClean, deleteField, deletionRecord, serverNow, stamped,
} from '../cloud/refs';
import { advanceBizMarks, Deletion, fetchBizChanges, listenBizChanges, mergeBizChanges } from '../cloud/sync';
import {
  dayDateOf, expenseDateOf, readActive, readCurrentId, readPart, readPending, readYears, removeBusinessCache,
  writeActive, writeCurrentId, writePart, writePending, writeYears,
} from '../cloud/cache';
import { deleteBusinessCode, findBusinessByCode, generateUniqueBusinessCode } from '../cloud/codes';
import { resolveBusinessPalette, useBusinessModeStore } from './modeStore';

// switch.ts carga este store: se pide con require() al usarlo
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * La cuenta de empresa: la pizzería de esta persona (una como mucho), su
 * configuración y sus días, gastos y fijos.
 *
 * Lo vendido cada día llega solo de la caja (la entrada `pos`, que escribe el
 * servidor) y se puede apuntar a mano. Lo que se apunta se ve al momento y se
 * guarda en la copia del móvil; la subida la hace Firestore, también sin
 * conexión. Si la nube lo rechaza, se quita de la copia.
 */

export type JoinResult = 'pending' | 'invalid' | 'already_member' | 'already_in_business' | 'has_pending' | 'error';
/** pos: la entrada de la caja, que no se toca desde la app */
export type WriteResult = 'ok' | 'empty' | 'pos';

export interface CreateBusinessInput {
  name: string;
  currencyCode: string;
}

export interface EntryInput extends Omit<DayEntry, 'id' | 'by' | 'at'> {
  id?: string;
}

export interface ExpenseInput extends Omit<BusinessExpense, 'id' | 'by' | 'createdAt'> {
  id?: string;
}

export interface RecurringInput extends Omit<BusinessRecurring, 'id' | 'by' | 'createdAt'> {
  id?: string;
}

interface BusinessStore {
  /** Si se está en la empresa (la app enseña sus pantallas) */
  active: boolean;
  business: Business | null;
  config: BusinessConfig | null;
  days: Record<string, BusinessDay>;
  expenses: Record<string, BusinessExpense>;
  recurring: Record<string, BusinessRecurring>;
  /** Años de días y gastos cargados de la copia */
  loadedYears: number[];
  incomingRequests: BusinessJoinRequest[];
  pendingRequest: PendingBusinessRequest | null;
  /** Hora de la última vez que se bajó lo cambiado de la nube */
  syncedAt: number | null;
  syncing: boolean;

  init: () => Promise<void>;
  refreshMembership: () => Promise<void>;
  activate: () => Promise<void>;
  deactivate: () => Promise<void>;
  sync: (full?: boolean) => Promise<boolean>;
  resume: () => void;
  ensureYear: (year: number) => Promise<void>;
  reset: () => void;

  createBusiness: (input: CreateBusinessInput) => Promise<Business>;
  requestJoin: (code: string) => Promise<JoinResult>;
  cancelRequest: () => Promise<void>;
  clearRejected: () => Promise<void>;
  approveRequest: (uid: string) => Promise<void>;
  rejectRequest: (uid: string) => Promise<void>;
  removeMember: (uid: string) => Promise<void>;
  leaveBusiness: () => Promise<void>;
  deleteBusiness: () => Promise<void>;
  updateBusiness: (fields: Partial<Pick<Business, 'name' | 'currencyCode' | 'colorPalette'>>) => Promise<void>;

  updateConfig: (fields: Partial<Omit<BusinessConfig, ConfigListKind>>) => Promise<void>;
  saveConfigItem: <K extends ConfigListKind>(kind: K, id: string | null, item: BusinessConfig[K][string]) => Promise<string>;
  deleteConfigItem: (kind: ConfigListKind, id: string) => Promise<void>;

  saveEntry: (dayId: string, input: EntryInput) => Promise<WriteResult>;
  deleteEntry: (dayId: string, entryId: string) => Promise<WriteResult>;

  saveExpense: (input: ExpenseInput) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  saveRecurring: (input: RecurringInput) => Promise<void>;
  deleteRecurring: (id: string) => Promise<void>;
  applyRecurring: () => Promise<void>;

  fetchChanges: (more?: boolean) => Promise<BusinessChange[]>;
}

// ── Escuchas ─────────────────────────────────────────────────────

let docUnsub: (() => void) | null = null;
let docFor: string | null = null;
let configUnsub: (() => void) | null = null;
let requestsUnsub: (() => void) | null = null;
let ownRequestUnsub: (() => void) | null = null;
let streamUnsubs: (() => void)[] = [];
let streamsFor: string | null = null;
let streamsSince = 0;
// La última lectura de los gastos vino del servidor: se pueden crear los fijos
let expensesFromServer = false;
// Para seguir leyendo el historial
let changesCursor: FirebaseFirestoreTypes.QueryDocumentSnapshot | null = null;

const stop = (fn: (() => void) | null) => { try { fn?.(); } catch {} };

const stopStreams = () => {
  streamUnsubs.forEach(stop);
  streamUnsubs = [];
  streamsFor = null;
  stop(configUnsub); configUnsub = null;
};

const stopAll = () => {
  stopStreams();
  stop(docUnsub); docUnsub = null; docFor = null;
  stop(requestsUnsub); requestsUnsub = null;
  stop(ownRequestUnsub); ownRequestUnsub = null;
};

const uidNow = () => auth().currentUser?.uid ?? null;

/** Tu nombre, como en la cuenta compartida */
export const myBusinessName = (): string =>
  useSettingsStore.getState().displayName?.trim()
  || auth().currentUser?.displayName?.trim()
  || auth().currentUser?.email?.split('@')[0]
  || i18n.t('common.user');

const isPermissionDenied = (e: unknown) => (e as { code?: string })?.code === 'firestore/permission-denied';

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

// Lo que se espera a la red en lo que no puede quedarse a medias en la cola de
// Firestore (salir de la empresa, borrarla)
const ONLINE_WAIT_MS = 10000;

/**
 * El documento tal y como está en el servidor, o null sin conexión. Una
 * lectura no se queda en ninguna cola: sirve para saber si hay red antes de
 * escribir algo que, sin ella, se subiría más tarde
 */
const fromServer = async (ref: FirebaseFirestoreTypes.DocumentReference) => {
  const snap = await withTimeout(ref.get({ source: 'server' }), ONLINE_WAIT_MS).catch(() => null);
  return snap && snap !== 'timeout' ? snap : null;
};

const offlineError = () => Object.assign(new Error('offline'), { code: 'offline' });

/**
 * Si la red se corta justo después de guardarse algo, Firestore lo vuelve a
 * mandar y las reglas lo niegan porque ya está hecho (ya no eres socio, ya no
 * existe la empresa). Se mira en el servidor: si ya no se puede leer, o lo
 * leído dice que está hecho, lo está
 */
const alreadyDone = async (
  ref: FirebaseFirestoreTypes.DocumentReference,
  done: (snap: FirebaseFirestoreTypes.DocumentSnapshot) => boolean,
): Promise<boolean> => {
  try {
    const snap = await withTimeout(ref.get({ source: 'server' }), ONLINE_WAIT_MS);
    return snap !== 'timeout' && done(snap);
  } catch (e) {
    return (e as { code?: string })?.code === 'firestore/permission-denied';
  }
};

/** El día de hoy del negocio */
export const todayDayId = (config: Pick<BusinessConfig, 'dayCutoffHour'> | null | undefined): string =>
  businessDayOf(new Date(), config?.dayCutoffHour ?? 0);

const EMPTY_STATE = {
  active: false,
  business: null,
  config: null,
  days: {},
  expenses: {},
  recurring: {},
  loadedYears: [] as number[],
  incomingRequests: [] as BusinessJoinRequest[],
  pendingRequest: null,
  syncedAt: null,
  syncing: false,
};

export const useBusinessStore = create<BusinessStore>((set, get) => {
  // ── La copia del móvil ─────────────────────────────────────────

  /** Carga de la copia lo de esta empresa: este año y el anterior */
  const loadLocal = async (businessId: string) => {
    const thisYear = new Date().getFullYear();
    const years = [thisYear - 1, thisYear];
    const [config, recurring, days, expenses] = await Promise.all([
      readPart.config(businessId),
      readPart.recurring(businessId),
      readYears<BusinessDay>(businessId, 'days', years),
      readYears<BusinessExpense>(businessId, 'expenses', years),
    ]);
    if (get().business?.id !== businessId) return;
    set({
      config: get().config ?? config,
      recurring: recurring ?? {},
      days,
      expenses,
      loadedYears: years,
    });
  };

  const ensureYearLoaded = async (businessId: string, years: number[]) => {
    const missing = [...new Set(years)].filter((y) => !get().loadedYears.includes(y));
    if (!missing.length) return;
    const [days, expenses] = await Promise.all([
      readYears<BusinessDay>(businessId, 'days', missing),
      readYears<BusinessExpense>(businessId, 'expenses', missing),
    ]);
    if (get().business?.id !== businessId) return;
    set((s) => ({
      days: { ...days, ...s.days },
      expenses: { ...expenses, ...s.expenses },
      loadedYears: [...new Set([...s.loadedYears, ...missing])],
    }));
  };

  const yearsOfIds = (ids: string[], dateOf: (id: string) => string | undefined) =>
    ids.map(dateOf).filter((d): d is string => !!d).map(yearOfDay);

  /**
   * Junta en la copia lo que llega de la nube (fromServer: del servidor, no
   * de la caché de Firestore; ver mergeBizChanges). Devuelve false si ya no
   * es la empresa de la copia (se ha salido mientras llegaba)
   */
  const mergeFromCloud = async (
    businessId: string, collection: BizCollection, changed: { id: string; updatedAt?: number }[], deleted: Deletion[],
    fromServer: boolean,
  ): Promise<boolean> => {
    if (get().business?.id !== businessId) return false;
    if (collection === 'recurring') {
      const local = Object.values(get().recurring);
      const merged = mergeBizChanges(local, changed as BusinessRecurring[], deleted, fromServer);
      if (merged === local) return true;
      const record = Object.fromEntries(merged.map((r) => [r.id, r]));
      set({ recurring: record });
      await writePart.recurring(businessId, record);
      return true;
    }
    const kind = collection;
    const dateOf = kind === 'days'
      ? (item: { id: string }) => (item as BusinessDay).id
      : (item: { id: string }) => (item as BusinessExpense).date;
    // Los años a los que tocan, cargados antes de juntar
    const current = get()[kind] as Record<string, { id: string; updatedAt?: number }>;
    const touched = [
      ...changed.map((c) => yearOfDay(dateOf(c))),
      ...yearsOfIds(deleted.map((d) => d.id), (id) => (current[id] ? dateOf(current[id]) : undefined)),
    ];
    await ensureYearLoaded(businessId, touched);
    if (get().business?.id !== businessId) return false;
    const local = Object.values(get()[kind] as Record<string, { id: string; updatedAt?: number }>);
    const merged = mergeBizChanges(local, changed, deleted, fromServer);
    if (merged === local) return true;
    const record = Object.fromEntries(merged.map((item) => [item.id, item]));
    set({ [kind]: record } as Partial<BusinessStore>);
    if (kind === 'days') {
      await writeYears(businessId, 'days', record as Record<string, BusinessDay>, touched, dayDateOf);
    } else {
      await writeYears(businessId, 'expenses', record as Record<string, BusinessExpense>, touched, expenseDateOf);
    }
    return true;
  };

  /** Pone en la copia lo apuntado aquí (sin hora del servidor hasta que suba) */
  const putLocal = {
    day: (day: BusinessDay) => {
      const business = get().business;
      if (!business) return;
      const days = { ...get().days, [day.id]: day };
      set({ days });
      writeYears(business.id, 'days', days, [yearOfDay(day.id)], dayDateOf);
    },
    expense: (expense: BusinessExpense | null, removeId?: string) => {
      const business = get().business;
      if (!business) return;
      const expenses = { ...get().expenses };
      const years: number[] = [];
      if (removeId && expenses[removeId]) {
        years.push(yearOfDay(expenses[removeId].date));
        delete expenses[removeId];
      }
      if (expense) {
        expenses[expense.id] = expense;
        years.push(yearOfDay(expense.date));
      }
      set({ expenses });
      writeYears(business.id, 'expenses', expenses, years, expenseDateOf);
    },
    recurring: (rec: BusinessRecurring | null, removeId?: string) => {
      const business = get().business;
      if (!business) return;
      const recurring = { ...get().recurring };
      if (removeId) delete recurring[removeId];
      if (rec) recurring[rec.id] = rec;
      set({ recurring });
      writePart.recurring(business.id, recurring);
    },
  };

  /**
   * Una escritura en la nube. Sin conexión queda pendiente y la sube
   * Firestore. Si la nube la rechaza, se deshace en la copia
   */
  const cloudWrite = (what: string, write: Promise<unknown>, undo?: () => void) => {
    write.catch((e) => {
      reportError(e, `empresa: ${what}`);
      undo?.();
    });
  };

  const logChange = (kind: ChangeKind, action: ChangeAction, targetId: string, day: string | null, before?: object | null) => {
    const business = get().business;
    const uid = uidNow();
    if (!business || !uid) return;
    const entry = {
      kind, action, targetId, day,
      before: before ? deepClean(before) : null,
      by: uid,
      byName: myBusinessName(),
      at: new Date().toISOString(),
      serverAt: serverNow(),
    };
    bizCol(business.id, 'changes').doc().set(entry).catch((e) => reportError(e, 'empresa: historial'));
  };

  /**
   * Las comisiones del día: lo que se quedan las formas de cobro que la
   * tienen (el datáfono, Stripe), como gastos con un id fijo por día y forma
   * de cobro. Se rehacen con cada cambio de lo vendido ese día. El servidor
   * hace lo mismo al llegar el cierre de la caja (ver logic/commissions)
   */
  const saveCommissions = (dayId: string, day: BusinessDay) => {
    const business = get().business;
    const config = get().config;
    const uid = uidNow();
    if (!business || !config || !uid) return;
    const amounts = dayCommissions(Object.values(day.entries ?? {}), config.channels ?? {});
    const type = config.expenseTypes?.[COMMISSIONS_TYPE];
    for (const [cid, amount] of Object.entries(amounts)) {
      const channel = config.channels[cid];
      const id = commissionExpenseId(dayId, cid);
      const existing = get().expenses[id];
      if (amount > 0) {
        if (existing?.amount === amount) continue;
        const expense: BusinessExpense = {
          id,
          date: dayId,
          amount,
          name: i18n.t('business.commissionOf', { name: channel?.name ?? cid }),
          typeId: COMMISSIONS_TYPE,
          typeName: type?.name ?? i18n.t('business.tpl.expenseTypes.commissions'),
          by: uid,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
        };
        putLocal.expense(expense);
        cloudWrite('comisión', bizCol(business.id, 'expenses').doc(id).set(stamped(expense)));
      } else if (existing) {
        putLocal.expense(null, id);
        const batch = firestore().batch();
        batch.delete(bizCol(business.id, 'expenses').doc(id));
        batch.set(businessRef(business.id).collection('deletedExpenses').doc(id), deletionRecord());
        cloudWrite('comisión', batch.commit());
      }
    }
  };

  // ── Escuchas de la empresa ─────────────────────────────────────

  /** Sin la empresa: la ha borrado su creador, te han sacado o has salido */
  const dropBusiness = async (businessId: string) => {
    const clear = async () => {
      stopAll();
      set({ ...EMPTY_STATE, pendingRequest: get().pendingRequest });
      useBusinessModeStore.setState({ active: false, paletteId: null });
      await writeActive(false);
      await writeCurrentId(null);
      await removeBusinessCache(businessId);
    };
    if (get().active) {
      // Se estaba en ella: la pantalla de carga tapa en el mismo momento en
      // que la app vuelve a la cuenta de debajo
      const { exitBusinessNow } = require('./switch');
      exitBusinessNow(clear);
    } else {
      await clear();
    }
  };

  const listenDoc = (businessId: string) => {
    if (docFor === businessId && docUnsub) return;
    stop(docUnsub);
    docFor = businessId;
    docUnsub = businessRef(businessId).onSnapshot((doc) => {
      const uid = uidNow();
      const data = doc.exists() ? doc.data() : undefined;
      if (!data || !uid || !(data.members as string[] | undefined)?.includes(uid)) {
        // Solo con la respuesta del servidor: la caché puede ir atrasada
        if (!doc.metadata.fromCache) dropBusiness(businessId);
        return;
      }
      const business = { ...(data as Omit<Business, 'id'>), id: doc.id } as Business;
      set({ business });
      writePart.doc(businessId, business);
      if (get().active) useBusinessModeStore.setState({ paletteId: resolveBusinessPalette(business.colorPalette) });
      if (business.createdBy === uid) listenRequests(businessId);
    }, (e) => {
      // Sin permiso: ya no eres socio
      if (isPermissionDenied(e)) dropBusiness(businessId);
      else reportError(e, 'empresa: escucha de la empresa');
      docUnsub = null;
      docFor = null;
    });
  };

  const listenRequests = (businessId: string) => {
    if (requestsUnsub) return;
    requestsUnsub = bizCol(businessId, 'joinRequests').onSnapshot((snap) => {
      set({ incomingRequests: snap.docs.map((d) => d.data() as BusinessJoinRequest) });
    }, (e) => {
      reportError(e, 'empresa: escucha de solicitudes');
      requestsUnsub = null;
    });
  };

  const listenConfig = (businessId: string) => {
    if (configUnsub) return;
    configUnsub = configRef(businessId).onSnapshot((doc) => {
      if (!doc.exists() || get().business?.id !== businessId) return;
      const { updatedAt: _u, ...config } = doc.data() as BusinessConfig & { updatedAt?: unknown };
      set({ config: config as BusinessConfig });
      writePart.config(businessId, config as BusinessConfig);
    }, (e) => { reportError(e, 'empresa: escucha de la configuración'); configUnsub = null; });
  };

  const startStreams = (businessId: string) => {
    if (streamsFor === businessId && streamUnsubs.length && Date.now() - streamsSince < RELISTEN_AFTER_MS) return;
    streamUnsubs.forEach(stop);
    streamUnsubs = [];
    streamsFor = businessId;
    streamsSince = Date.now();
    const collections: BizCollection[] = ['days', 'expenses', 'recurring'];
    for (const collection of collections) {
      streamUnsubs.push(listenBizChanges(
        businessId, collection,
        (changed, deleted, fromServer) => mergeFromCloud(businessId, collection, changed, deleted, fromServer),
        (e) => {
          reportError(e, `empresa: escucha de ${collection}`);
          // Firestore la cierra tras un error: la siguiente vuelta la rehace
          streamsSince = 0;
        },
      ));
    }
  };

  const ownRequestListener = (pending: PendingBusinessRequest) => {
    const uid = uidNow();
    if (!uid) return;
    stop(ownRequestUnsub);
    ownRequestUnsub = businessRef(pending.businessId).collection('joinRequests').doc(uid).onSnapshot(async (doc) => {
      if (!doc.exists()) {
        if (doc.metadata.fromCache) return;
        // Aprobada (ya eres socio) o la empresa ya no existe
        stop(ownRequestUnsub);
        ownRequestUnsub = null;
        set({ pendingRequest: null });
        await writePending(null);
        await get().refreshMembership();
        return;
      }
      const status = doc.data()?.status === 'rejected' ? 'rejected' : 'pending';
      const current = get().pendingRequest;
      if (!current || current.status === status) return;
      const updated = { ...current, status } as PendingBusinessRequest;
      set({ pendingRequest: updated });
      await writePending(updated);
    }, (e) => reportError(e, 'empresa: escucha de tu solicitud'));
  };

  const adoptBusiness = async (business: Business) => {
    const previous = get().business;
    if (previous && previous.id !== business.id) {
      // Otra empresa que la de la copia (con la app cerrada, te sacaron de
      // aquella y entraste en esta desde otro móvil): nada de la anterior
      // pasa a esta. Lo de esta se baja entero después
      stopAll();
      expensesFromServer = false;
      changesCursor = null;
      set({ config: null, days: {}, expenses: {}, recurring: {}, loadedYears: [], incomingRequests: [] });
      await removeBusinessCache(previous.id);
    }
    set({ business });
    await writePart.doc(business.id, business);
    await writeCurrentId(business.id);
    listenDoc(business.id);
    const uid = uidNow();
    if (business.createdBy === uid) listenRequests(business.id);
  };

  const pull = async (businessId: string, collection: BizCollection): Promise<boolean> => {
    const changes = await fetchBizChanges<{ id: string; updatedAt?: number }>(businessId, collection);
    const merged = await mergeFromCloud(businessId, collection, changes.changed, changes.deleted, changes.fromServer);
    // Las marcas, solo con la respuesta del servidor (como en las otras
    // cuentas): la caché de Firestore puede no tener algo anterior a lo que tiene
    if (merged && changes.fromServer) await advanceBizMarks(businessId, collection, changes);
    return changes.fromServer;
  };

  /**
   * Comprobación entera de lo reciente (al deslizar en Hoy): lo de este mes y
   * el anterior, tal y como está en el servidor. Quita de la copia lo que el
   * servidor no tiene (lo que rechazó)
   */
  const fullCheck = async (businessId: string) => {
    const todayId = todayDayId(get().config);
    const from = `${monthKeyOfDay(shiftDayId(`${monthKeyOfDay(todayId)}-01`, -1))}-01`;
    const [daysSnap, expensesSnap, recurringSnap] = await Promise.all([
      bizCol(businessId, 'days').where(firestore.FieldPath.documentId(), '>=', from).get({ source: 'server' }),
      bizCol(businessId, 'expenses').where('date', '>=', from).get({ source: 'server' }),
      bizCol(businessId, 'recurring').get({ source: 'server' }),
    ]);
    if (get().business?.id !== businessId) return;
    const days = daysSnap.docs.map((d) => fromCloud<BusinessDay>(d));
    const expenses = expensesSnap.docs.map((d) => fromCloud<BusinessExpense>(d));
    const recurring = recurringSnap.docs.map((d) => fromCloud<BusinessRecurring>(d));

    const keepOld = <T extends { id: string }>(record: Record<string, T>, inWindow: (item: T) => boolean) =>
      Object.fromEntries(Object.entries(record).filter(([, item]) => !inWindow(item)));
    const dayRecord = { ...keepOld(get().days, (d) => d.id >= from), ...Object.fromEntries(days.map((d) => [d.id, d])) };
    const expenseRecord = {
      ...keepOld(get().expenses, (e) => e.date >= from),
      ...Object.fromEntries(expenses.map((e) => [e.id, e])),
    };
    const recurringRecord = Object.fromEntries(recurring.map((r) => [r.id, r]));
    set({ days: dayRecord, expenses: expenseRecord, recurring: recurringRecord });
    const years = [yearOfDay(from), yearOfDay(todayId)];
    await writeYears(businessId, 'days', dayRecord, years, dayDateOf);
    await writeYears(businessId, 'expenses', expenseRecord, years, expenseDateOf);
    await writePart.recurring(businessId, recurringRecord);
    expensesFromServer = true;
  };

  return {
    ...EMPTY_STATE,

    // ── Arranque ─────────────────────────────────────────────────

    init: async () => {
      if (!businessAllowed()) return;
      const uid = uidNow();
      if (!uid) return;
      const [businessId, active, pending] = await Promise.all([readCurrentId(), readActive(), readPending()]);
      set({ pendingRequest: pending });
      if (businessId) {
        const [business, config] = await Promise.all([readPart.doc(businessId), readPart.config(businessId)]);
        if (business && business.members?.includes(uid)) {
          set({ business, config });
          if (active) {
            set({ active: true });
            useBusinessModeStore.setState({ active: true, paletteId: resolveBusinessPalette(business.colorPalette) });
            await loadLocal(businessId);
          }
        }
      }
      if (pending) ownRequestListener(pending);
      // En la nube, sin esperar: el arranque no se retrasa
      get().refreshMembership()
        .then(() => {
          const current = get().business;
          if (get().active && current) {
            // También si no se ha podido comprobar (sin conexión): la escucha
            // sigue sola cuando vuelve la red y ve si te han sacado
            listenDoc(current.id);
            listenConfig(current.id);
            return get().sync()
              .catch((e) => reportError(e, 'empresa: bajar lo cambiado'))
              .then(() => {
                startStreams(current.id);
                return get().applyRecurring();
              });
          }
          return undefined;
        })
        .catch((e) => reportError(e, 'empresa: arranque'));
    },

    refreshMembership: async () => {
      if (!businessAllowed()) return;
      const uid = uidNow();
      if (!uid) return;
      try {
        const snap = await businessesCol().where('members', 'array-contains', uid).limit(1).get();
        if (snap.metadata.fromCache) return;
        if (snap.empty) {
          const current = get().business;
          if (current) await dropBusiness(current.id);
          return;
        }
        const doc = snap.docs[0];
        const business = { ...(doc.data() as Omit<Business, 'id'>), id: doc.id } as Business;
        await adoptBusiness(business);
        // Tu nombre en la empresa, si lo has cambiado
        const name = myBusinessName();
        if (business.memberNames?.[uid] !== name) {
          businessRef(business.id).update({ [`memberNames.${uid}`]: name }).catch(() => {});
        }
      } catch (e) {
        // Sin conexión: se sigue con la copia
        if (!isPermissionDenied(e)) return;
        reportError(e, 'empresa: comprobar la empresa');
      }
    },

    activate: async () => {
      const business = get().business;
      if (!business) return;
      set({ active: true });
      useBusinessModeStore.setState({ active: true, paletteId: resolveBusinessPalette(business.colorPalette) });
      await writeActive(true);
      if (!Object.keys(get().days).length) await loadLocal(business.id);
      listenDoc(business.id);
      listenConfig(business.id);
      try {
        await get().sync();
      } catch (e) {
        reportError(e, 'empresa: bajar lo cambiado');
      }
      startStreams(business.id);
      get().applyRecurring().catch((e) => reportError(e, 'empresa: fijos'));
    },

    deactivate: async () => {
      stopStreams();
      set({ active: false });
      useBusinessModeStore.setState({ active: false, paletteId: null });
      await writeActive(false);
    },

    sync: async (full = false) => {
      const business = get().business;
      if (!business) return false;
      set({ syncing: true });
      try {
        if (full) {
          await fullCheck(business.id);
        } else {
          const results = await Promise.all((['days', 'expenses', 'recurring'] as BizCollection[])
            .map((c) => pull(business.id, c).then((fromServer) => [c, fromServer] as const)));
          expensesFromServer = results.some(([c, fromServer]) => c === 'expenses' && fromServer);
        }
        set({ syncedAt: Date.now() });
        return true;
      } finally {
        set({ syncing: false });
      }
    },

    /** Al volver la app a primer plano: rehace las escuchas si llevan horas */
    resume: () => {
      const business = get().business;
      if (!business || !get().active) return;
      listenDoc(business.id);
      listenConfig(business.id);
      startStreams(business.id);
    },

    ensureYear: async (year) => {
      const business = get().business;
      if (business) await ensureYearLoaded(business.id, [year]);
    },

    reset: () => {
      stopAll();
      expensesFromServer = false;
      changesCursor = null;
      set({ ...EMPTY_STATE });
      useBusinessModeStore.setState({ active: false, paletteId: null });
    },

    // ── Socios ───────────────────────────────────────────────────

    createBusiness: async (input) => {
      const uid = uidNow();
      if (!uid) throw new Error('no-user');
      const existing = await businessesCol().where('members', 'array-contains', uid).limit(1).get({ source: 'server' });
      if (!existing.empty) throw new Error('already_in_business');

      const createdAt = new Date().toISOString();
      const id = businessesCol().doc().id;
      const name = input.name.trim().slice(0, 60);
      let business: Business | null = null;
      for (let attempt = 0; attempt < 3 && !business; attempt++) {
        const candidate: Business = {
          id,
          name,
          createdBy: uid,
          members: [uid],
          memberNames: { [uid]: myBusinessName() },
          inviteCode: await generateUniqueBusinessCode(),
          createdAt,
          template: 'pizzeria',
          currencyCode: input.currencyCode,
        };
        const batch = firestore().batch();
        batch.set(businessRef(id), candidate);
        batch.set(businessCodeRef(candidate.inviteCode), { businessId: id, name, createdAt });
        try {
          await batch.commit();
          business = candidate;
        } catch (e) {
          // El código lo acaba de coger otra empresa: se prueba con otro
          if (attempt === 2 || !isPermissionDenied(e)) throw e;
        }
      }
      if (!business) throw new Error('create-failed');

      const config = buildConfig();
      await configRef(id).set(stamped(config));

      set({ config, days: {}, expenses: {}, recurring: {}, loadedYears: [] });
      await writePart.config(id, config);
      await adoptBusiness(business);
      return business;
    },

    requestJoin: async (rawCode) => {
      const uid = uidNow();
      if (!uid) return 'error';
      if (get().pendingRequest?.status === 'pending') return 'has_pending';
      if (get().business) return 'already_in_business';
      try {
        const existing = await businessesCol().where('members', 'array-contains', uid).limit(1).get();
        if (!existing.empty) return 'already_in_business';
        const target = await findBusinessByCode(rawCode);
        if (!target) return 'invalid';
        const requestedAt = new Date().toISOString();
        const requestRef = businessRef(target.businessId).collection('joinRequests').doc(uid);
        // Una solicitud anterior (rechazada o de otro móvil) haría de esto una
        // modificación, que las reglas no dejan: se borra antes
        await requestRef.delete().catch(() => {});
        await requestRef.set({ uid, displayName: myBusinessName(), status: 'pending', requestedAt });
        const pending: PendingBusinessRequest = {
          businessId: target.businessId, businessName: target.name, status: 'pending', requestedAt,
        };
        set({ pendingRequest: pending });
        await writePending(pending);
        ownRequestListener(pending);
        return 'pending';
      } catch (e) {
        reportError(e, 'empresa: pedir entrar');
        return 'error';
      }
    },

    cancelRequest: async () => {
      const uid = uidNow();
      const pending = get().pendingRequest;
      if (uid && pending) {
        await businessRef(pending.businessId).collection('joinRequests').doc(uid).delete().catch(() => {});
      }
      stop(ownRequestUnsub);
      ownRequestUnsub = null;
      set({ pendingRequest: null });
      await writePending(null);
    },

    clearRejected: async () => {
      await get().cancelRequest();
    },

    approveRequest: async (requesterUid) => {
      const business = get().business;
      if (!business) return;
      if (business.members.length >= MAX_BUSINESS_MEMBERS) throw new Error('full');
      const requestRef = bizCol(business.id, 'joinRequests').doc(requesterUid);
      const snap = await requestRef.get();
      if (!snap.exists()) return;
      const request = snap.data() as BusinessJoinRequest;
      const batch = firestore().batch();
      batch.update(businessRef(business.id), {
        members: firestore.FieldValue.arrayUnion(requesterUid),
        [`memberNames.${requesterUid}`]: request.displayName || i18n.t('common.user'),
      });
      batch.delete(requestRef);
      await batch.commit();
    },

    rejectRequest: async (requesterUid) => {
      const business = get().business;
      if (!business) return;
      await bizCol(business.id, 'joinRequests').doc(requesterUid).update({ status: 'rejected' });
    },

    removeMember: async (memberUid) => {
      const business = get().business;
      if (!business || memberUid === business.createdBy) return;
      await businessRef(business.id).update({ members: firestore.FieldValue.arrayRemove(memberUid) });
    },

    leaveBusiness: async () => {
      const uid = uidNow();
      const business = get().business;
      if (!uid || !business || business.createdBy === uid) return;
      // Con conexión: sin ella se quedaría en la cola y la app, a medias
      if (!(await fromServer(businessRef(business.id)))) throw offlineError();
      // Tu nombre se queda: lo que apuntaste sigue firmado
      await businessRef(business.id).update({ members: firestore.FieldValue.arrayRemove(uid) }).catch(async (e) => {
        if (isPermissionDenied(e) && await alreadyDone(
          businessRef(business.id), (snap) => !(snap.data()?.members as string[] | undefined)?.includes(uid),
        )) return;
        throw e;
      });
      stopAll();
      set({ ...EMPTY_STATE, active: get().active, pendingRequest: get().pendingRequest });
      await writeCurrentId(null);
      await removeBusinessCache(business.id);
    },

    deleteBusiness: async () => {
      const uid = uidNow();
      const business = get().business;
      if (!uid || !business || business.createdBy !== uid) return;
      const ref = businessRef(business.id);
      // Con conexión: sin ella se borraría solo lo que hay en el móvil y el
      // resto se quedaría en la nube
      if (!(await fromServer(ref))) throw offlineError();
      // Lo de dentro, leído del servidor y en lotes (ver batchDelete). El
      // documento de la empresa, al final: si algo falla antes, sigue en pie,
      // con sus escuchas, y se puede reintentar
      const refs: FirebaseFirestoreTypes.DocumentReference[] = [];
      for (const name of BUSINESS_SUBCOLLECTIONS) {
        const snap = await ref.collection(name).get({ source: 'server' });
        snap.docs.forEach((doc) => refs.push(doc.ref));
      }
      await deleteRefsInChunks(refs);
      // Su código, antes: las reglas miran en ella quién la creó
      await deleteBusinessCode(business);
      stopAll();
      await ref.delete().catch(async (e) => {
        if (isPermissionDenied(e) && await alreadyDone(ref, (snap) => !snap.exists())) return;
        throw e;
      });
      set({ ...EMPTY_STATE, active: get().active, pendingRequest: get().pendingRequest });
      await writeCurrentId(null);
      await removeBusinessCache(business.id);
    },

    updateBusiness: async (fields) => {
      const business = get().business;
      if (!business) return;
      const clean = deepClean(fields);
      const updated = { ...business, ...clean };
      set({ business: updated });
      writePart.doc(business.id, updated);
      if (fields.colorPalette !== undefined && get().active) {
        useBusinessModeStore.setState({ paletteId: resolveBusinessPalette(fields.colorPalette) });
      }
      await businessRef(business.id).update(clean);
      if (fields.name && fields.name !== business.name) {
        businessCodeRef(business.inviteCode).update({ name: fields.name }).catch(() => {});
      }
    },

    // ── Configuración ────────────────────────────────────────────

    updateConfig: async (fields) => {
      const business = get().business;
      const config = get().config;
      if (!business || !config) return;
      const clean = deepClean(fields);
      const updated = { ...config, ...clean } as BusinessConfig;
      set({ config: updated });
      writePart.config(business.id, updated);
      cloudWrite('configuración', configRef(business.id).update({ ...clean, updatedAt: serverNow() }));
    },

    saveConfigItem: async (kind, id, item) => {
      const business = get().business;
      const config = get().config;
      if (!business || !config) return id ?? '';
      const itemId = id ?? newId(kind.slice(0, 2));
      const clean = deepClean(item);
      const updated = { ...config, [kind]: { ...config[kind], [itemId]: clean } } as BusinessConfig;
      set({ config: updated });
      writePart.config(business.id, updated);
      // Solo su campo: lo que otro socio cambie a la vez en otra pieza se queda
      cloudWrite('configuración', configRef(business.id).update({ [`${kind}.${itemId}`]: clean, updatedAt: serverNow() }));
      return itemId;
    },

    /** Quitar de la lista algo que no se ha usado nunca (lo usado se archiva) */
    deleteConfigItem: async (kind, id) => {
      const business = get().business;
      const config = get().config;
      if (!business || !config?.[kind]?.[id]) return;
      const { [id]: _removed, ...rest } = config[kind] as Record<string, unknown>;
      const updated = { ...config, [kind]: rest } as BusinessConfig;
      set({ config: updated });
      writePart.config(business.id, updated);
      cloudWrite('configuración', configRef(business.id).update({ [`${kind}.${id}`]: deleteField(), updatedAt: serverNow() }));
    },

    // ── Días ─────────────────────────────────────────────────────

    /**
     * Lo vendido a mano (un día sin caja, un encargo de fuera). Si el día aún
     * no estaba cerrado, apuntarlo lo cierra (y avisa a los socios); si ya lo
     * estaba (lo cerró la caja), se suma a lo suyo. La entrada de la caja no
     * se toca desde aquí
     */
    saveEntry: async (dayId, input) => {
      const business = get().business;
      const uid = uidNow();
      if (!business || !uid) return 'empty';
      if (input.id && isPosEntry({ id: input.id })) return 'pos';
      const day = get().days[dayId];
      const previous = input.id ? day?.entries?.[input.id] : undefined;
      const now = new Date().toISOString();
      const entry: DayEntry = deepClean({
        ...input,
        id: input.id ?? newId('e'),
        by: previous?.by ?? uid,
        at: previous?.at ?? now,
      });
      const closing = day?.status !== 'closed';
      const closeFields = closing ? { status: 'closed' as const, closedBy: uid, closedAt: now } : {};
      const updatedDay: BusinessDay = {
        ...(day ?? { id: dayId, status: 'closed', entries: {} }),
        ...closeFields,
        entries: { ...(day?.entries ?? {}), [entry.id]: entry },
        updatedAt: undefined,
      };
      putLocal.day(updatedDay);
      const ref = bizCol(business.id, 'days').doc(dayId);
      // Si el día ya existe, solo el campo de la entrada, entero: lo de los
      // demás (la caja, otro socio) se queda. Si no, el día nuevo con ella
      const write = day?.updatedAt
        ? ref.update({ [`entries.${entry.id}`]: entry, ...closeFields, updatedAt: serverNow() })
        : ref.set({ id: dayId, ...closeFields, entries: { [entry.id]: entry }, updatedAt: serverNow() }, { merge: true });
      cloudWrite('guardar venta', write, () => (day ? putLocal.day(day) : undefined));
      if (previous) logChange('entry', 'edit', entry.id, dayId, previous);
      saveCommissions(dayId, updatedDay);
      return 'ok';
    },

    deleteEntry: async (dayId, entryId) => {
      const business = get().business;
      const day = get().days[dayId];
      const previous = day?.entries?.[entryId];
      if (!business || !day || !previous) return 'empty';
      if (isPosEntry(previous)) return 'pos';
      const { [entryId]: _removed, ...entries } = day.entries;
      // Sin nada apuntado, el día vuelve a estar sin cerrar
      const reopen = Object.keys(entries).length === 0 ? { status: 'open' as const, closedBy: null, closedAt: null } : {};
      const updatedDay: BusinessDay = { ...day, ...reopen, entries, updatedAt: undefined };
      putLocal.day(updatedDay);
      cloudWrite(
        'borrar venta',
        bizCol(business.id, 'days').doc(dayId).update({ [`entries.${entryId}`]: deleteField(), ...reopen, updatedAt: serverNow() }),
        () => putLocal.day(day),
      );
      logChange('entry', 'delete', entryId, dayId, previous);
      saveCommissions(dayId, updatedDay);
      return 'ok';
    },

    // ── Gastos y fijos ───────────────────────────────────────────

    saveExpense: async (input) => {
      const business = get().business;
      const uid = uidNow();
      if (!business || !uid) return;
      const previous = input.id ? get().expenses[input.id] : undefined;
      const expense: BusinessExpense = deepClean({
        ...input,
        id: input.id ?? bizCol(business.id, 'expenses').doc().id,
        amount: cents(input.amount),
        vat: typeof input.vat === 'number' ? cents(input.vat) : undefined,
        by: previous?.by ?? uid,
        createdAt: previous?.createdAt ?? new Date().toISOString(),
        updatedAt: undefined,
      });
      putLocal.expense(expense, previous && previous.date !== expense.date ? previous.id : undefined);
      cloudWrite(
        'guardar gasto',
        bizCol(business.id, 'expenses').doc(expense.id).set(stamped(expense)),
        () => putLocal.expense(previous ?? null, previous ? undefined : expense.id),
      );
      if (previous) logChange('expense', 'edit', expense.id, previous.date, previous);
    },

    deleteExpense: async (id) => {
      const business = get().business;
      const previous = get().expenses[id];
      if (!business || !previous) return;
      putLocal.expense(null, id);
      const batch = firestore().batch();
      batch.delete(bizCol(business.id, 'expenses').doc(id));
      batch.set(businessRef(business.id).collection('deletedExpenses').doc(id), deletionRecord());
      // El gasto de un fijo: ese mes ya no se vuelve a crear
      if (previous.recurringId && get().recurring[previous.recurringId]) {
        const month = monthKeyOfDay(previous.date);
        batch.update(bizCol(business.id, 'recurring').doc(previous.recurringId), {
          skipped: firestore.FieldValue.arrayUnion(month),
          updatedAt: serverNow(),
        });
        const rec = get().recurring[previous.recurringId];
        putLocal.recurring({ ...rec, skipped: [...new Set([...(rec.skipped ?? []), month])], updatedAt: undefined });
      }
      cloudWrite('borrar gasto', batch.commit(), () => putLocal.expense(previous));
      logChange('expense', 'delete', id, previous.date, previous);
    },

    saveRecurring: async (input) => {
      const business = get().business;
      const uid = uidNow();
      if (!business || !uid) return;
      const previous = input.id ? get().recurring[input.id] : undefined;
      const rec: BusinessRecurring = deepClean({
        ...input,
        id: input.id ?? bizCol(business.id, 'recurring').doc().id,
        amount: cents(input.amount),
        vat: typeof input.vat === 'number' ? cents(input.vat) : undefined,
        day: Math.min(31, Math.max(1, Math.round(input.day))),
        by: previous?.by ?? uid,
        createdAt: previous?.createdAt ?? new Date().toISOString(),
        updatedAt: undefined,
      });
      putLocal.recurring(rec);
      cloudWrite(
        'guardar fijo',
        bizCol(business.id, 'recurring').doc(rec.id).set(stamped(rec)),
        () => putLocal.recurring(previous ?? null, previous ? undefined : rec.id),
      );
      if (previous) logChange('recurring', 'edit', rec.id, null, previous);
      get().applyRecurring().catch(() => {});
    },

    deleteRecurring: async (id) => {
      const business = get().business;
      const previous = get().recurring[id];
      if (!business || !previous) return;
      putLocal.recurring(null, id);
      const batch = firestore().batch();
      batch.delete(bizCol(business.id, 'recurring').doc(id));
      batch.set(businessRef(business.id).collection('deletedRecurring').doc(id), deletionRecord());
      cloudWrite('borrar fijo', batch.commit(), () => putLocal.recurring(previous));
      logChange('recurring', 'delete', id, null, previous);
    },

    /**
     * Crea los gastos de los fijos que ya tocaban. Solo con los gastos recién
     * bajados del servidor: sin conexión podría crear otra vez uno que un
     * socio ya ha cambiado. Hasta el año pasado (lo cargado en el móvil)
     */
    applyRecurring: async () => {
      const business = get().business;
      const uid = uidNow();
      if (!business || !uid || !expensesFromServer) return;
      const thisYear = new Date().getFullYear();
      const since = new Date(thisYear - 1, 0, 1);
      const recurring = Object.values(get().recurring).map((r) => (
        new Date(r.createdAt) < since ? { ...r, createdAt: since.toISOString() } : r
      ));
      const due = dueRecurringExpenses(recurring, existingRecurringKeys(Object.values(get().expenses)), new Date(), uid);
      for (const expense of due) {
        putLocal.expense(expense);
        cloudWrite('fijo del mes', bizCol(business.id, 'expenses').doc(expense.id).set(stamped(expense)), () => putLocal.expense(null, expense.id));
      }
    },

    // ── Historial ────────────────────────────────────────────────

    fetchChanges: async (more = false) => {
      const business = get().business;
      if (!business) return [];
      if (!more) changesCursor = null;
      let query = bizCol(business.id, 'changes').orderBy('at', 'desc').limit(30);
      if (more && changesCursor) query = query.startAfter(changesCursor);
      const snap = await query.get();
      changesCursor = snap.docs[snap.docs.length - 1] ?? changesCursor;
      return snap.docs.map((d) => {
        const { serverAt: _s, ...data } = d.data() as BusinessChange & { serverAt?: unknown };
        return { ...data, id: d.id } as BusinessChange;
      });
    },
  };

});

export const businessIsCreator = (business: Business | null | undefined) =>
  !!business && business.createdBy === uidNow();

export const currentUid = uidNow;

/** Hoy, como día del negocio */
export const businessToday = () => todayDayId(useBusinessStore.getState().config);

export { dayIdOfDate, MAX_BUSINESS_MEMBERS };
export type { ConfigItem };
