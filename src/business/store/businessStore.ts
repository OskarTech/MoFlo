import { create } from 'zustand';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import i18n from '../../i18n';
import { reportError } from '../../services/crashReporting';
import { deleteSubcollections } from '../../services/firebase/batchDelete';
import { fromCloud } from '../../services/firebase/cloudSync';
import { mergeChanges, RELISTEN_AFTER_MS } from '../../store/cloudCheck';
import { useSettingsStore } from '../../store/settingsStore';
import { BUSINESS_ENABLED } from '../featureFlag';
import {
  Business, BusinessChange, BusinessConfig, BusinessDay, BusinessExpense, BusinessJoinRequest,
  BusinessRecurring, Catalog, ChangeAction, ChangeKind, ConfigItem, ConfigListKind, DayEntry,
  ManualAmount, MAX_BUSINESS_MEMBERS, Order, OrderLine, PendingBusinessRequest, TemplateId,
} from '../types';
import {
  businessDayOf, cents, dayIdOfDate, monthKeyOfDay, newId, shiftDayId, yearOfDay,
} from '../logic/basics';
import { orderTotal, summarizeOrders } from '../logic/orders';
import { usesOrders } from '../logic/days';
import { dueRecurringExpenses, existingRecurringKeys } from '../logic/recurring';
import { buildCatalog, buildConfig, COMMISSIONS_TYPE, CreateConfigInput } from '../templates';
import {
  BizCollection, BUSINESS_SUBCOLLECTIONS, bizCol, businessCodeRef, businessRef, businessesCol,
  catalogRef, configRef, deepClean, deleteField, deletionRecord, serverNow, stamped,
} from '../cloud/refs';
import { advanceBizMarks, Deletion, fetchBizChanges, listenBizChanges } from '../cloud/sync';
import {
  dayDateOf, expenseDateOf, ORDER_DAYS_KEPT, pruneOrderDays, readActive, readCurrentId, readOrderDays,
  readPart, readPending, readYears, removeBusinessCache, writeActive, writeCurrentId, writeOrderDays,
  writePart, writePending, writeYears,
} from '../cloud/cache';
import { deleteBusinessCode, findBusinessByCode, generateUniqueBusinessCode } from '../cloud/codes';
import { resolveBusinessPalette, useBusinessModeStore } from './modeStore';

// switch.ts carga este store: se pide con require() al usarlo
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * La cuenta de empresa: la empresa de esta persona (una como mucho), su
 * configuración, su carta y sus días, pedidos, gastos y fijos.
 *
 * Lo que se apunta se ve al momento y se guarda en la copia del móvil; la
 * subida la hace Firestore, también sin conexión. Si la nube lo rechaza (un
 * pedido que llega con el día ya cerrado), se quita de la copia y se avisa.
 */

export type JoinResult = 'pending' | 'invalid' | 'already_member' | 'already_in_business' | 'has_pending' | 'error';
export type WriteResult = 'ok' | 'dayClosed' | 'empty';
export type CloseResult = 'ok' | 'offline' | 'error';

export interface CreateBusinessInput extends CreateConfigInput {
  name: string;
  template: TemplateId;
  currencyCode: string;
}

export interface OrderInput {
  id?: string;
  lines: OrderLine[];
  channelId: string;
  note?: string;
}

export interface EntryInput extends Omit<DayEntry, 'id' | 'by' | 'at'> {
  id?: string;
}

/** Lo que se confirma al cerrar el día */
export interface CloseInput {
  /** Pedido a pedido: lo que se cambia sobre lo que dicen los pedidos, por forma de cobro */
  adjust?: Record<string, number>;
  manual?: ManualAmount[];
  float?: number | null;
  counted?: number | null;
  workerId?: string | null;
  workerName?: string | null;
  note?: string;
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
  catalog: Catalog | null;
  days: Record<string, BusinessDay>;
  orders: Record<string, Order>;
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
  saveCatalogItem: <K extends keyof Catalog>(kind: K, id: string | null, item: Catalog[K][string]) => Promise<string>;

  saveOrder: (input: OrderInput) => Promise<WriteResult>;
  voidOrder: (id: string) => Promise<WriteResult>;
  fetchDayOrders: (dayId: string) => Promise<Order[]>;
  saveEntry: (dayId: string, input: EntryInput) => Promise<WriteResult>;
  deleteEntry: (dayId: string, entryId: string) => Promise<WriteResult>;
  closeDay: (dayId: string, input?: CloseInput) => Promise<CloseResult>;
  reopenDay: (dayId: string) => Promise<void>;

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
let catalogUnsub: (() => void) | null = null;
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
  stop(catalogUnsub); catalogUnsub = null;
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

/** El día de hoy del negocio */
export const todayDayId = (config: Pick<BusinessConfig, 'dayCutoffHour'> | null | undefined): string =>
  businessDayOf(new Date(), config?.dayCutoffHour ?? 0);

const EMPTY_STATE = {
  active: false,
  business: null,
  config: null,
  catalog: null,
  days: {},
  orders: {},
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

  /** Carga de la copia lo de esta empresa: este año y el anterior, y los pedidos recientes */
  const loadLocal = async (businessId: string) => {
    const thisYear = new Date().getFullYear();
    const years = [thisYear - 1, thisYear];
    const todayId = todayDayId(get().config);
    const orderDays = Array.from({ length: ORDER_DAYS_KEPT + 1 }, (_, i) => shiftDayId(todayId, -i));
    const [config, catalog, recurring, days, expenses, orders] = await Promise.all([
      readPart.config(businessId),
      readPart.catalog(businessId),
      readPart.recurring(businessId),
      readYears<BusinessDay>(businessId, 'days', years),
      readYears<BusinessExpense>(businessId, 'expenses', years),
      readOrderDays(businessId, orderDays),
    ]);
    if (get().business?.id !== businessId) return;
    set({
      config: get().config ?? config,
      catalog: get().catalog ?? catalog,
      recurring: recurring ?? {},
      days,
      expenses,
      orders,
      loadedYears: years,
    });
    pruneOrderDays(businessId, shiftDayId(todayId, -ORDER_DAYS_KEPT));
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
   * Junta en la copia lo que llega de la nube. Devuelve false si ya no es la
   * empresa de la copia (se ha salido mientras llegaba)
   */
  const mergeFromCloud = async (
    businessId: string, collection: BizCollection, changed: { id: string; updatedAt?: number }[], deleted: Deletion[],
  ): Promise<boolean> => {
    if (get().business?.id !== businessId) return false;
    if (collection === 'orders') {
      const local = Object.values(get().orders);
      const merged = mergeChanges(local, changed as Order[], deleted);
      if (merged === local) return true;
      const record = Object.fromEntries(merged.map((o) => [o.id, o]));
      set({ orders: record });
      await writeOrderDays(businessId, record, (changed as Order[]).map((o) => o.day));
      return true;
    }
    if (collection === 'recurring') {
      const local = Object.values(get().recurring);
      const merged = mergeChanges(local, changed as BusinessRecurring[], deleted);
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
    const merged = mergeChanges(local, changed, deleted);
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
    order: (order: Order | null, removeId?: string) => {
      const business = get().business;
      if (!business) return;
      const orders = { ...get().orders };
      const days = new Set<string>();
      if (removeId && orders[removeId]) {
        days.add(orders[removeId].day);
        delete orders[removeId];
      }
      if (order) {
        orders[order.id] = order;
        days.add(order.day);
      }
      set({ orders });
      writeOrderDays(business.id, orders, days);
    },
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
   * Firestore. Si la nube la rechaza, se deshace en la copia y se avisa
   */
  const cloudWrite = (what: string, write: Promise<unknown>, undo?: () => void, onRejected?: (e: unknown) => void) => {
    write.catch((e) => {
      reportError(e, `empresa: ${what}`);
      undo?.();
      onRejected?.(e);
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

  const listenConfigAndCatalog = (businessId: string) => {
    if (!configUnsub) {
      configUnsub = configRef(businessId).onSnapshot((doc) => {
        if (!doc.exists() || get().business?.id !== businessId) return;
        const { updatedAt: _u, ...config } = doc.data() as BusinessConfig & { updatedAt?: unknown };
        set({ config: config as BusinessConfig });
        writePart.config(businessId, config as BusinessConfig);
      }, (e) => { reportError(e, 'empresa: escucha de la configuración'); configUnsub = null; });
    }
    if (!catalogUnsub) {
      catalogUnsub = catalogRef(businessId).onSnapshot((doc) => {
        if (!doc.exists() || get().business?.id !== businessId) return;
        const { updatedAt: _u, ...catalog } = doc.data() as Catalog & { updatedAt?: unknown };
        set({ catalog: catalog as Catalog });
        writePart.catalog(businessId, catalog as Catalog);
      }, (e) => { reportError(e, 'empresa: escucha de la carta'); catalogUnsub = null; });
    }
  };

  const ordersWindow = (col: FirebaseFirestoreTypes.CollectionReference) =>
    col.where('day', '>=', shiftDayId(todayDayId(get().config), -ORDER_DAYS_KEPT));

  const startStreams = (businessId: string) => {
    if (streamsFor === businessId && streamUnsubs.length && Date.now() - streamsSince < RELISTEN_AFTER_MS) return;
    streamUnsubs.forEach(stop);
    streamUnsubs = [];
    streamsFor = businessId;
    streamsSince = Date.now();
    const collections: BizCollection[] = ['days', 'orders', 'expenses', 'recurring'];
    for (const collection of collections) {
      streamUnsubs.push(listenBizChanges(
        businessId, collection,
        (changed, deleted) => mergeFromCloud(businessId, collection, changed, deleted),
        (e) => {
          reportError(e, `empresa: escucha de ${collection}`);
          // Firestore la cierra tras un error: la siguiente vuelta la rehace
          streamsSince = 0;
        },
        collection === 'orders' ? ordersWindow : undefined,
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
    set({ business });
    await writePart.doc(business.id, business);
    await writeCurrentId(business.id);
    listenDoc(business.id);
    const uid = uidNow();
    if (business.createdBy === uid) listenRequests(business.id);
  };

  const pull = async (businessId: string, collection: BizCollection): Promise<boolean> => {
    const changes = await fetchBizChanges<{ id: string; updatedAt?: number }>(
      businessId, collection, collection === 'orders' ? ordersWindow : undefined,
    );
    const merged = await mergeFromCloud(businessId, collection, changes.changed, changes.deleted);
    if (merged) await advanceBizMarks(businessId, collection, changes);
    return changes.fromServer;
  };

  /**
   * Comprobación entera de lo reciente (al deslizar en Hoy): lo de este mes y
   * el anterior, y los pedidos de las últimas semanas, tal y como están en el
   * servidor. Quita de la copia lo que el servidor no tiene (lo que rechazó)
   */
  const fullCheck = async (businessId: string) => {
    const todayId = todayDayId(get().config);
    const from = `${monthKeyOfDay(shiftDayId(`${monthKeyOfDay(todayId)}-01`, -1))}-01`;
    const ordersFrom = shiftDayId(todayId, -ORDER_DAYS_KEPT);
    const [daysSnap, expensesSnap, ordersSnap, recurringSnap] = await Promise.all([
      bizCol(businessId, 'days').where(firestore.FieldPath.documentId(), '>=', from).get({ source: 'server' }),
      bizCol(businessId, 'expenses').where('date', '>=', from).get({ source: 'server' }),
      bizCol(businessId, 'orders').where('day', '>=', ordersFrom).get({ source: 'server' }),
      bizCol(businessId, 'recurring').get({ source: 'server' }),
    ]);
    if (get().business?.id !== businessId) return;
    const days = daysSnap.docs.map((d) => fromCloud<BusinessDay>(d));
    const expenses = expensesSnap.docs.map((d) => fromCloud<BusinessExpense>(d));
    const orders = ordersSnap.docs.map((d) => fromCloud<Order>(d));
    const recurring = recurringSnap.docs.map((d) => fromCloud<BusinessRecurring>(d));

    const keepOld = <T extends { id: string }>(record: Record<string, T>, inWindow: (item: T) => boolean) =>
      Object.fromEntries(Object.entries(record).filter(([, item]) => !inWindow(item)));
    const dayRecord = { ...keepOld(get().days, (d) => d.id >= from), ...Object.fromEntries(days.map((d) => [d.id, d])) };
    const expenseRecord = {
      ...keepOld(get().expenses, (e) => e.date >= from),
      ...Object.fromEntries(expenses.map((e) => [e.id, e])),
    };
    const orderRecord = {
      ...keepOld(get().orders, (o) => o.day >= ordersFrom),
      ...Object.fromEntries(orders.map((o) => [o.id, o])),
    };
    const recurringRecord = Object.fromEntries(recurring.map((r) => [r.id, r]));
    set({ days: dayRecord, expenses: expenseRecord, orders: orderRecord, recurring: recurringRecord });
    const years = [yearOfDay(from), yearOfDay(todayId)];
    await writeYears(businessId, 'days', dayRecord, years, dayDateOf);
    await writeYears(businessId, 'expenses', expenseRecord, years, expenseDateOf);
    const orderDays = Array.from({ length: ORDER_DAYS_KEPT + 1 }, (_, i) => shiftDayId(todayId, -i));
    await writeOrderDays(businessId, orderRecord, orderDays);
    await writePart.recurring(businessId, recurringRecord);
    expensesFromServer = true;
  };

  /**
   * Las comisiones del día: lo que se quedan las formas de cobro que la
   * tienen (Glovo, el banco del TPV), como gastos con un id fijo por día y
   * forma de cobro. Al volver a cerrar, se rehacen con lo nuevo
   */
  const saveCommissions = (dayId: string, day: BusinessDay) => {
    const business = get().business;
    const config = get().config;
    const uid = uidNow();
    if (!business || !config || !uid) return;
    const byChannel: Record<string, number> = {};
    for (const entry of Object.values(day.entries ?? {})) {
      for (const [cid, amount] of Object.entries(entry.amounts ?? {})) {
        byChannel[cid] = cents((byChannel[cid] ?? 0) + amount);
      }
    }
    const type = config.expenseTypes?.[COMMISSIONS_TYPE];
    for (const [cid, channel] of Object.entries(config.channels ?? {})) {
      const pct = channel.commissionPct ?? 0;
      const id = `com_${dayId.replace(/-/g, '')}_${cid}`;
      const amount = pct > 0 ? cents(((byChannel[cid] ?? 0) * pct) / 100) : 0;
      const existing = get().expenses[id];
      if (amount > 0) {
        if (existing?.amount === amount) continue;
        const expense: BusinessExpense = {
          id,
          date: dayId,
          amount,
          name: i18n.t('business.commissionOf', { name: channel.name }),
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

  return {
    ...EMPTY_STATE,

    // ── Arranque ─────────────────────────────────────────────────

    init: async () => {
      if (!BUSINESS_ENABLED) return;
      const uid = uidNow();
      if (!uid) return;
      const [businessId, active, pending] = await Promise.all([readCurrentId(), readActive(), readPending()]);
      set({ pendingRequest: pending });
      if (businessId) {
        const [business, config, catalog] = await Promise.all([
          readPart.doc(businessId), readPart.config(businessId), readPart.catalog(businessId),
        ]);
        if (business && business.members?.includes(uid)) {
          set({ business, config, catalog });
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
            listenConfigAndCatalog(current.id);
            return get().sync().then(() => {
              startStreams(current.id);
              return get().applyRecurring();
            });
          }
          return undefined;
        })
        .catch((e) => reportError(e, 'empresa: arranque'));
    },

    refreshMembership: async () => {
      if (!BUSINESS_ENABLED) return;
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
      if (!Object.keys(get().days).length && !Object.keys(get().orders).length) await loadLocal(business.id);
      listenDoc(business.id);
      listenConfigAndCatalog(business.id);
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
          const results = await Promise.all((['days', 'orders', 'expenses', 'recurring'] as BizCollection[])
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
      listenConfigAndCatalog(business.id);
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
          template: input.template,
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

      const config = buildConfig(input);
      const catalog = buildCatalog(input.template);
      const batch = firestore().batch();
      batch.set(configRef(id), stamped(config));
      batch.set(catalogRef(id), stamped(catalog));
      await batch.commit();

      set({ config, catalog, days: {}, orders: {}, expenses: {}, recurring: {}, loadedYears: [] });
      await writePart.config(id, config);
      await writePart.catalog(id, catalog);
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
      // Tu nombre se queda: lo que apuntaste sigue firmado
      await businessRef(business.id).update({ members: firestore.FieldValue.arrayRemove(uid) });
      stopAll();
      set({ ...EMPTY_STATE, active: get().active, pendingRequest: get().pendingRequest });
      await writeCurrentId(null);
      await removeBusinessCache(business.id);
    },

    deleteBusiness: async () => {
      const uid = uidNow();
      const business = get().business;
      if (!uid || !business || business.createdBy !== uid) return;
      stopAll();
      const ref = businessRef(business.id);
      // En lotes (ver batchDelete). El documento de la empresa, al final: si
      // algo falla antes, sigue en pie y se puede reintentar
      await deleteSubcollections(ref, BUSINESS_SUBCOLLECTIONS);
      // Su código, antes: las reglas miran en ella quién la creó
      await deleteBusinessCode(business);
      await ref.delete();
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

    // ── Configuración y carta ────────────────────────────────────

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

    saveCatalogItem: async (kind, id, item) => {
      const business = get().business;
      const catalog = get().catalog ?? { categories: {}, products: {}, extras: {} };
      if (!business) return id ?? '';
      const itemId = id ?? newId(kind === 'categories' ? 'c_' : kind === 'products' ? 'p_' : 'x_');
      const clean = deepClean(item);
      const updated = { ...catalog, [kind]: { ...catalog[kind], [itemId]: clean } } as Catalog;
      set({ catalog: updated });
      writePart.catalog(business.id, updated);
      // Solo su campo, entero (con sus tamaños): lo demás de la carta se queda
      cloudWrite('carta', catalogRef(business.id).update({ [`${kind}.${itemId}`]: clean, updatedAt: serverNow() }));
      return itemId;
    },

    // ── Pedidos ──────────────────────────────────────────────────

    saveOrder: async ({ id, lines, channelId, note }) => {
      const business = get().business;
      const config = get().config;
      const uid = uidNow();
      if (!business || !config || !uid) return 'empty';
      const clean = lines.filter((l) => l.qty > 0);
      if (!clean.length) return 'empty';
      const previous = id ? get().orders[id] : undefined;
      const day = previous?.day ?? todayDayId(config);
      const status = get().days[day]?.status ?? 'open';
      if (status !== 'open') return 'dayClosed';
      const order: Order = {
        id: previous?.id ?? bizCol(business.id, 'orders').doc().id,
        day,
        at: previous?.at ?? new Date().toISOString(),
        lines: clean,
        total: orderTotal(clean),
        channelId,
        channelName: config.channels[channelId]?.name ?? channelId,
        status: 'ok',
        by: previous?.by ?? uid,
        ...(note?.trim() ? { note: note.trim() } : {}),
      };
      putLocal.order(order);
      cloudWrite(
        'guardar pedido',
        bizCol(business.id, 'orders').doc(order.id).set(stamped(order)),
        () => putLocal.order(previous ?? null, previous ? undefined : order.id),
        (e) => {
          if (!isPermissionDenied(e)) return;
          const { notifyRejected } = require('./notices');
          notifyRejected('order');
        },
      );
      if (previous) {
        logChange('order', 'edit', order.id, day, {
          lines: previous.lines, total: previous.total, channelName: previous.channelName,
        });
      }
      return 'ok';
    },

    voidOrder: async (id) => {
      const business = get().business;
      const uid = uidNow();
      const previous = get().orders[id];
      if (!business || !uid || !previous) return 'empty';
      if ((get().days[previous.day]?.status ?? 'open') !== 'open') return 'dayClosed';
      const order: Order = { ...previous, status: 'void', voidedBy: uid, voidedAt: new Date().toISOString(), updatedAt: undefined };
      putLocal.order(order);
      cloudWrite(
        'anular pedido',
        bizCol(business.id, 'orders').doc(id).set(stamped(order)),
        () => putLocal.order(previous),
        (e) => {
          if (!isPermissionDenied(e)) return;
          const { notifyRejected } = require('./notices');
          notifyRejected('order');
        },
      );
      logChange('order', 'void', id, previous.day, {
        lines: previous.lines, total: previous.total, channelName: previous.channelName,
      });
      return 'ok';
    },

    /** Los pedidos de un día antiguo, que ya no están en el móvil */
    fetchDayOrders: async (dayId) => {
      const business = get().business;
      if (!business) return [];
      const local = Object.values(get().orders).filter((o) => o.day === dayId);
      try {
        const snap = await bizCol(business.id, 'orders').where('day', '==', dayId).get();
        const orders = snap.docs.map((d) => fromCloud<Order>(d));
        await mergeFromCloud(business.id, 'orders', orders, []);
        return Object.values(get().orders).filter((o) => o.day === dayId);
      } catch (e) {
        reportError(e, 'empresa: pedidos de un día');
        return local;
      }
    },

    // ── Días ─────────────────────────────────────────────────────

    saveEntry: async (dayId, input) => {
      const business = get().business;
      const uid = uidNow();
      if (!business || !uid) return 'empty';
      const day = get().days[dayId];
      if ((day?.status ?? 'open') !== 'open') return 'dayClosed';
      const previous = input.id ? day?.entries?.[input.id] : undefined;
      const entry: DayEntry = deepClean({
        ...input,
        id: input.id ?? newId('e'),
        by: previous?.by ?? uid,
        at: previous?.at ?? new Date().toISOString(),
      });
      const updatedDay: BusinessDay = {
        ...(day ?? { id: dayId, status: 'open', entries: {} }),
        entries: { ...(day?.entries ?? {}), [entry.id]: entry },
        updatedAt: undefined,
      };
      putLocal.day(updatedDay);
      const ref = bizCol(business.id, 'days').doc(dayId);
      // Si el día ya existe (o se cambia una caja que ya estaba), solo su
      // campo y entero: lo de los demás socios se queda y no sobrevive nada
      // de lo que se ha quitado. Si no, el día nuevo con ella (el estado no se
      // toca: si ya estaba cerrado en la nube, sigue cerrado)
      const write = previous || day?.updatedAt
        ? ref.update({ [`entries.${entry.id}`]: entry, updatedAt: serverNow() })
        : ref.set({ id: dayId, entries: { [entry.id]: entry }, updatedAt: serverNow() }, { merge: true });
      cloudWrite('guardar caja', write, () => day && putLocal.day(day));
      if (previous) logChange('entry', 'edit', entry.id, dayId, previous);
      return 'ok';
    },

    deleteEntry: async (dayId, entryId) => {
      const business = get().business;
      const day = get().days[dayId];
      const previous = day?.entries?.[entryId];
      if (!business || !day || !previous) return 'empty';
      if ((day.status ?? 'open') !== 'open') return 'dayClosed';
      const { [entryId]: _removed, ...entries } = day.entries;
      putLocal.day({ ...day, entries, updatedAt: undefined });
      cloudWrite(
        'borrar caja',
        bizCol(business.id, 'days').doc(dayId).update({ [`entries.${entryId}`]: deleteField(), updatedAt: serverNow() }),
        () => putLocal.day(day),
      );
      logChange('entry', 'delete', entryId, dayId, previous);
      return 'ok';
    },

    /**
     * Cerrar el día. Pedido a pedido, en tres pasos: se marca «cerrando» (las
     * reglas ya no dejan añadir pedidos), se bajan del servidor los pedidos
     * del día y se guarda su resumen con lo confirmado. Así no se escapa un
     * pedido que llegue a la vez. Si se corta entre medias, el día se queda
     * «cerrando» y cualquier socio lo termina. Por caja o en Sencillo, un paso.
     */
    closeDay: async (dayId, input = {}) => {
      const business = get().business;
      const config = get().config;
      const uid = uidNow();
      if (!business || !config || !uid) return 'error';
      const ref = bizCol(business.id, 'days').doc(dayId);
      const now = new Date().toISOString();
      const before = get().days[dayId];

      if (!usesOrders(config)) {
        const day: BusinessDay = {
          ...(before ?? { id: dayId, entries: {} }),
          id: dayId,
          status: 'closed',
          closedBy: uid,
          closedAt: now,
          updatedAt: undefined,
        };
        putLocal.day(day);
        cloudWrite(
          'cerrar día',
          ref.set({ id: dayId, status: 'closed', closedBy: uid, closedAt: now, updatedAt: serverNow() }, { merge: true }),
          () => before && putLocal.day(before),
        );
        saveCommissions(dayId, day);
        return 'ok';
      }

      // 1. «Cerrando»: hace falta conexión, para que no entre ningún pedido después
      const marked = await withTimeout(
        ref.set({ id: dayId, status: 'closing', updatedAt: serverNow() }, { merge: true }).then(() => 'ok' as const),
        10000,
      ).catch((e) => {
        reportError(e, 'empresa: cerrar día (1)');
        return 'error' as const;
      });
      if (marked !== 'ok') return marked === 'timeout' ? 'offline' : 'error';

      try {
        // 2. Los pedidos del día, del servidor
        const snap = await bizCol(business.id, 'orders').where('day', '==', dayId).get({ source: 'server' });
        const orders = snap.docs.map((d) => fromCloud<Order>(d));
        const summary = summarizeOrders(orders);

        // 3. El cierre: lo de los pedidos más lo que se cambió a mano
        const amounts: Record<string, number> = {};
        const channelIds = new Set([...Object.keys(summary.byChannel), ...Object.keys(input.adjust ?? {})]);
        channelIds.forEach((cid) => {
          const amount = cents((summary.byChannel[cid] ?? 0) + (input.adjust?.[cid] ?? 0));
          if (amount > 0) amounts[cid] = amount;
        });
        const entry: DayEntry = deepClean({
          id: 'close',
          fromOrders: true,
          amounts,
          channelNames: Object.fromEntries([...channelIds].map((cid) => [
            cid, config.channels[cid]?.name ?? summary.channelNames[cid] ?? cid,
          ])),
          manual: input.manual?.filter((m) => m.amount > 0),
          float: input.float ?? null,
          counted: input.counted ?? null,
          workerId: input.workerId ?? null,
          workerName: input.workerName ?? null,
          note: input.note?.trim() || undefined,
          by: uid,
          at: now,
        });
        await ref.update({
          status: 'closed',
          closedBy: uid,
          closedAt: now,
          ordersSummary: deepClean(summary),
          'entries.close': entry,
          updatedAt: serverNow(),
        });
        await mergeFromCloud(business.id, 'orders', orders, []);
        const day: BusinessDay = {
          ...(get().days[dayId] ?? { id: dayId, entries: {} }),
          id: dayId,
          status: 'closed',
          closedBy: uid,
          closedAt: now,
          ordersSummary: summary,
          entries: { ...(get().days[dayId]?.entries ?? {}), close: entry },
          updatedAt: undefined,
        };
        putLocal.day(day);
        saveCommissions(dayId, day);
        return 'ok';
      } catch (e) {
        reportError(e, 'empresa: cerrar día (2-3)');
        putLocal.day({ ...(get().days[dayId] ?? { id: dayId, entries: {} }), id: dayId, status: 'closing', updatedAt: undefined });
        return 'error';
      }
    },

    reopenDay: async (dayId) => {
      const business = get().business;
      const uid = uidNow();
      const day = get().days[dayId];
      if (!business || !uid || !day) return;
      const now = new Date().toISOString();
      putLocal.day({ ...day, status: 'open', reopenedBy: uid, reopenedAt: now, updatedAt: undefined });
      cloudWrite(
        'reabrir día',
        bizCol(business.id, 'days').doc(dayId).update({
          status: 'open', reopenedBy: uid, reopenedAt: now, updatedAt: serverNow(),
        }),
        () => putLocal.day(day),
      );
      logChange('day', 'reopen', dayId, dayId, { status: day.status, closedBy: day.closedBy, closedAt: day.closedAt });
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

/** Lo que hay que saber de un día para apuntar en él (abierto, cerrando o cerrado) */
export const dayStatusOf = (dayId: string) => useBusinessStore.getState().days[dayId]?.status ?? 'open';

export const businessIsCreator = (business: Business | null | undefined) =>
  !!business && business.createdBy === uidNow();

export const currentUid = uidNow;

/** Hoy, como día del negocio */
export const businessToday = () => todayDayId(useBusinessStore.getState().config);

export { dayIdOfDate, MAX_BUSINESS_MEMBERS };
export type { ConfigItem };
