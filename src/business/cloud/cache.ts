import AsyncStorage from '@react-native-async-storage/async-storage';
import { reportError } from '../../services/crashReporting';
import { yearOfDay } from '../logic/basics';
import {
  Business, BusinessConfig, BusinessDay, BusinessExpense, BusinessRecurring, PendingBusinessRequest,
} from '../types';

/**
 * La copia de la empresa en el móvil, para enseñarla al momento y sin conexión.
 *
 * Va por partes y no en una sola clave: en Android, AsyncStorage tiene un tope
 * de 6 MB para toda la app y cada clave se lee entera. Los días y los gastos,
 * una clave por año.
 */

const PREFIX = '@moflo_biz_';
/** Si se está en la empresa (sobrevive a cerrar la app) */
const ACTIVE_KEY = `${PREFIX}active`;
/** La empresa de esta persona: su id */
const CURRENT_KEY = `${PREFIX}current`;
const PENDING_KEY = `${PREFIX}pending_request`;

type Part = 'doc' | 'config' | 'recurring';
const partKey = (businessId: string, part: Part) => `${PREFIX}${businessId}_${part}`;
const yearKey = (businessId: string, kind: 'days' | 'expenses', year: number) => `${PREFIX}${businessId}_${kind}_${year}`;

const readJson = async <T>(key: string): Promise<T | null> => {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (e) {
    reportError(e, `empresa: leer ${key}`);
    return null;
  }
};

const writeJson = (key: string, value: unknown) =>
  AsyncStorage.setItem(key, JSON.stringify(value)).catch((e) => reportError(e, `empresa: guardar ${key}`));

export const readActive = async () => (await AsyncStorage.getItem(ACTIVE_KEY)) === '1';
export const writeActive = (active: boolean) => AsyncStorage.setItem(ACTIVE_KEY, active ? '1' : '0').catch(() => {});

export const readCurrentId = () => AsyncStorage.getItem(CURRENT_KEY).catch(() => null);
export const writeCurrentId = (businessId: string | null) =>
  (businessId ? AsyncStorage.setItem(CURRENT_KEY, businessId) : AsyncStorage.removeItem(CURRENT_KEY)).catch(() => {});

export const readPending = () => readJson<PendingBusinessRequest>(PENDING_KEY);
export const writePending = (pending: PendingBusinessRequest | null) =>
  (pending ? writeJson(PENDING_KEY, pending) : AsyncStorage.removeItem(PENDING_KEY).catch(() => {}));

export const readPart = {
  doc: (id: string) => readJson<Business>(partKey(id, 'doc')),
  config: (id: string) => readJson<BusinessConfig>(partKey(id, 'config')),
  recurring: (id: string) => readJson<Record<string, BusinessRecurring>>(partKey(id, 'recurring')),
};

export const writePart = {
  doc: (id: string, value: Business) => writeJson(partKey(id, 'doc'), value),
  config: (id: string, value: BusinessConfig) => writeJson(partKey(id, 'config'), value),
  recurring: (id: string, value: Record<string, BusinessRecurring>) => writeJson(partKey(id, 'recurring'), value),
};

/** Los días o los gastos de esos años */
export const readYears = async <T>(
  businessId: string, kind: 'days' | 'expenses', years: number[],
): Promise<Record<string, T>> => {
  const out: Record<string, T> = {};
  for (const year of years) {
    Object.assign(out, (await readJson<Record<string, T>>(yearKey(businessId, kind, year))) ?? {});
  }
  return out;
};

/** Guarda los años de esa lista que tengan algo en `touched` (los demás no han cambiado) */
export const writeYears = async <T extends { id: string }>(
  businessId: string,
  kind: 'days' | 'expenses',
  all: Record<string, T>,
  touchedYears: Iterable<number>,
  dateOf: (item: T) => string,
) => {
  for (const year of new Set(touchedYears)) {
    const bucket: Record<string, T> = {};
    for (const item of Object.values(all)) {
      if (yearOfDay(dateOf(item)) === year) bucket[item.id] = item;
    }
    await writeJson(yearKey(businessId, kind, year), bucket);
  }
};

export const dayDateOf = (day: BusinessDay) => day.id;
export const expenseDateOf = (expense: BusinessExpense) => expense.date;

/** La copia de una empresa (al salir de ella o si deja de existir) */
export const removeBusinessCache = async (businessId: string) => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    // Su copia y sus marcas de sincronización (ver sync)
    const ours = keys.filter((k) => k.startsWith(`${PREFIX}${businessId}_`)
      || (k.includes('_mark_biz_') && k.endsWith(`_${businessId}`)));
    if (ours.length) await AsyncStorage.multiRemove(ours);
  } catch {}
};

/** Todo lo de la empresa en el móvil, al cerrar sesión o borrar la cuenta */
export const removeBusinessCaches = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.startsWith(PREFIX) || k.includes('_mark_biz_'));
    if (ours.length) await AsyncStorage.multiRemove(ours);
  } catch {}
};
