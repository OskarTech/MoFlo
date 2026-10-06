import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

/**
 * Cuándo se baja de la nube el historial de movimientos y de movimientos de
 * huchas. Antes se bajaba entero cada vez que se abría la app o se cambiaba de
 * cuenta, y Firestore cobra una lectura por cada movimiento: con el historial
 * creciendo, cada apertura costaba más.
 *
 * Lo que se cambia en el móvil se sube a la nube en el momento (o con la cola
 * sin conexión), así que la copia de la nube ya está al día. Bajarla solo sirve
 * para ver lo que se ha cambiado desde otro sitio:
 * - Individual: la copia del móvil, y el historial entero cada 14 días.
 * - Compartida: lo apuntado en los últimos 30 días al entrar (y en directo), y
 *   el historial entero cada 14 días.
 * - Siempre entero si no hay copia en el móvil, al deslizar en Inicio, con
 *   «Comprobar» en Ajustes y antes de exportar.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const FULL_CHECK_EVERY_MS = 14 * DAY_MS;
export const RECENT_DAYS = 30;

/**
 * De qué cuenta son los movimientos que tiene cargados un store: PERSONAL o el
 * id de la compartida. Lo reciente de una cuenta solo se junta con su propia
 * copia: al entrar en otra cuenta, un momento siguen los de la anterior.
 * (Las comprobaciones se guardan por el uid en la individual y por el id de
 * la cuenta en la compartida.)
 */
export const PERSONAL = 'personal';

export type CloudCollection = 'movements' | 'huchaMovements';
const COLLECTIONS: CloudCollection[] = ['movements', 'huchaMovements'];

const CHECK_KEY = '@moflo_cloud_check';
const checkKey = (collection: CloudCollection, scope: string) => `${CHECK_KEY}_${collection}_${scope}`;

/**
 * Desde las 00:00 de hace 30 días, por cuándo se apuntó (createdAt) y no por la
 * fecha del movimiento: así también llega un gasto atrasado que alguien apunta
 * hoy, o los fijos de meses sin abrir la app. Es el mismo valor todo el día:
 * la escucha y la carga piden lo mismo y Firestore no lo lee dos veces.
 */
export const recentSince = (now = new Date()): string =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() - RECENT_DAYS).toISOString();

const isRecent = (doc: { createdAt?: unknown }, since: string) =>
  typeof doc.createdAt === 'string' && doc.createdAt >= since;

/**
 * La copia del móvil con lo reciente de la nube: lo que llega sustituye a lo
 * que había y lo anterior a `since` se queda como estaba. Si la respuesta es
 * del servidor, lo reciente del móvil que no viene se ha borrado; si es de la
 * caché de Firestore (sin conexión) puede estar incompleta, y no se quita nada.
 */
export const mergeRecent = <T extends { id: string; createdAt?: unknown }>(
  local: T[],
  recent: T[],
  since: string,
  fromServer: boolean,
): T[] => {
  const incoming = new Set(recent.map((d) => d.id));
  const kept = local.filter((d) => !incoming.has(d.id) && !(fromServer && isRecent(d, since)));
  return [...recent, ...kept];
};

/** Última comprobación entera de cada colección, para Ajustes */
export const useCloudCheckStore = create<{ checkedAt: Record<string, number> }>(() => ({ checkedAt: {} }));

const readCheck = async (collection: CloudCollection, scope: string): Promise<number | null> => {
  const key = checkKey(collection, scope);
  const at = Number(await AsyncStorage.getItem(key));
  if (!Number.isFinite(at) || at <= 0) return null;
  if (useCloudCheckStore.getState().checkedAt[key] !== at) {
    useCloudCheckStore.setState((s) => ({ checkedAt: { ...s.checkedAt, [key]: at } }));
  }
  return at;
};

/** Toca bajarla entera: nunca se ha hecho, hace 14 días o más, o el reloj ha ido hacia atrás */
export const isFullCheckDue = async (collection: CloudCollection, scope: string, now = Date.now()) => {
  const at = await readCheck(collection, scope);
  return at == null || now - at >= FULL_CHECK_EVERY_MS || at > now + DAY_MS;
};

export const markFullCheck = async (collection: CloudCollection, scope: string, at = Date.now()) => {
  const key = checkKey(collection, scope);
  await AsyncStorage.setItem(key, String(at));
  useCloudCheckStore.setState((s) => ({ checkedAt: { ...s.checkedAt, [key]: at } }));
};

/** La más antigua de las dos colecciones, o null si alguna no se ha comprobado nunca */
export const lastFullCheck = async (scope: string): Promise<number | null> => {
  const ats = await Promise.all(COLLECTIONS.map((c) => readCheck(c, scope)));
  return ats.some((at) => at == null) ? null : Math.min(...(ats as number[]));
};

/** Lo mismo que lastFullCheck, de lo ya leído: para pintarlo sin esperar */
export const selectLastFullCheck = (checkedAt: Record<string, number>, scope: string): number | null => {
  const ats = COLLECTIONS.map((c) => checkedAt[checkKey(c, scope)]);
  return ats.some((at) => at == null) ? null : Math.min(...ats);
};

/** Al cerrar sesión: quien entre después empieza comprobando entero */
export const removeCloudChecks = async () => {
  const keys = await AsyncStorage.getAllKeys();
  const ours = keys.filter((k) => k.startsWith(`${CHECK_KEY}_`));
  if (ours.length > 0) await AsyncStorage.multiRemove(ours);
  useCloudCheckStore.setState({ checkedAt: {} });
};
