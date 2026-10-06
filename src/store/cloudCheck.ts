import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

/**
 * Cómo se baja de la nube el historial de movimientos y de movimientos de
 * huchas. Firestore cobra una lectura por documento: bajarlo entero cada vez
 * que se abría la app costaba más según crecía el historial.
 *
 * Cada movimiento lleva la hora del servidor de su último cambio (updatedAt),
 * y cada borrado deja un apunte con la suya en deletedMovements o
 * deletedHuchaMovements, que Firestore borra solo a los 30 días. El móvil
 * recuerda, por cuenta, la hora más reciente que le ha llegado (la marca) y
 * pide solo lo posterior, con unos minutos de margen:
 * - Al abrir la app o entrar en la cuenta, individual o compartida.
 * - En directo, en la compartida.
 * - Entero cada 14 días, si no hay copia en el móvil, al deslizar en Inicio,
 *   con «Comprobar» en Ajustes y antes de exportar. Lo que cambie una versión
 *   anterior a la 2.0.5, que no pone la hora, solo llega así.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const FULL_CHECK_EVERY_MS = 14 * DAY_MS;
// Lo que se vuelve a pedir de antes de la marca: por si algo se guarda con una
// hora un poco anterior a la de otro cambio que ya ha llegado
export const SYNC_MARGIN_MS = 5 * 60 * 1000;
// Lo que dura el apunte de un borrado: más que la comprobación entera, que es
// cuando ya no hace falta
export const DELETION_TTL_MS = 30 * DAY_MS;
// La escucha en directo junta todo lo cambiado desde que empezó, y Firestore
// lo vuelve a leer entero tras media hora sin conexión (en segundo plano, por
// ejemplo). Pasado este rato, se vuelve a empezar desde la marca
export const RELISTEN_AFTER_MS = 6 * 60 * 60 * 1000;

/**
 * De qué cuenta son los movimientos que tiene cargados un store: PERSONAL o el
 * id de la compartida. Lo que llega de una cuenta solo se junta con su propia
 * copia: al entrar en otra cuenta, un momento siguen los de la anterior.
 * (Las comprobaciones y las marcas se guardan por el uid en la individual y
 * por el id de la cuenta en la compartida.)
 */
export const PERSONAL = 'personal';

export type CloudCollection = 'movements' | 'huchaMovements';
const COLLECTIONS: CloudCollection[] = ['movements', 'huchaMovements'];

/** Dónde se apuntan los borrados de cada colección */
export const DELETED = {
  movements: 'deletedMovements',
  huchaMovements: 'deletedHuchaMovements',
} as const;

/** Lo que se pide a la nube: una colección o sus borrados */
export type SyncStream = CloudCollection | (typeof DELETED)[CloudCollection];

const CHECK_KEY = '@moflo_cloud_check';
const checkKey = (collection: CloudCollection, scope: string) => `${CHECK_KEY}_${collection}_${scope}`;
const markKey = (stream: SyncStream, scope: string) => `${CHECK_KEY}_mark_${stream}_${scope}`;

/** La marca: la hora del servidor más reciente que ha llegado (ms), o null */
export const readMark = async (stream: SyncStream, scope: string): Promise<number | null> => {
  const at = Number(await AsyncStorage.getItem(markKey(stream, scope)));
  return Number.isFinite(at) && at > 0 ? at : null;
};

/**
 * Sube la marca, nunca la baja. Va después de guardar la copia del móvil: si
 * algo falla entre medias, se vuelve a pedir lo mismo y no se pierde nada. Si
 * dos llamadas se cruzan y queda más baja, igual: se piden otra vez unos pocos.
 */
export const advanceMark = async (stream: SyncStream, scope: string, at: number | null) => {
  if (at == null) return;
  const current = await readMark(stream, scope);
  if (current != null && current >= at) return;
  await AsyncStorage.setItem(markKey(stream, scope), String(at));
};

/** Desde cuándo pedir los cambios: unos minutos antes de la marca, o todo */
export const changesSince = (mark: number | null): number => Math.max(0, (mark ?? 0) - SYNC_MARGIN_MS);

type Versioned = { id: string; updatedAt?: number };

/** La hora del servidor más reciente de una lista, o null si ninguno la tiene */
export const latestUpdate = (list: Versioned[]): number | null => {
  let latest: number | null = null;
  for (const doc of list) {
    if (typeof doc.updatedAt === 'number' && (latest == null || doc.updatedAt > latest)) latest = doc.updatedAt;
  }
  return latest;
};

/**
 * Lo borrado que ha llegado en esta sesión, por colección y cuenta (id → hora
 * del borrado). La carga y la escucha van por separado: sin esto, una
 * respuesta que salió de la nube antes de un borrado y llega después de su
 * apunte lo devolvía, y se quedaba hasta la comprobación entera.
 */
const graveyards = new Map<string, Map<string, number>>();
export const graveyardOf = (collection: CloudCollection, scope: string): Map<string, number> => {
  const key = `${collection}_${scope}`;
  let graveyard = graveyards.get(key);
  if (!graveyard) {
    graveyard = new Map();
    graveyards.set(key, graveyard);
  }
  return graveyard;
};

/** Si un documento se borró después de esta versión suya (ver graveyardOf) */
const isBuried = (graveyard: Map<string, number> | undefined, doc: Versioned) => {
  const deletedAt = graveyard?.get(doc.id);
  return deletedAt != null && (doc.updatedAt == null || doc.updatedAt <= deletedAt);
};

/** Lo bajado entero, sin lo que se borró después de leerlo */
export const withoutBuried = <T extends Versioned>(docs: T[], graveyard: Map<string, number>): T[] =>
  docs.filter((doc) => !isBuried(graveyard, doc));

/**
 * La copia del móvil con lo que ha cambiado en la nube. De cada documento gana
 * lo más reciente, por la hora del servidor:
 * - Lo que llega sustituye a lo que había, salvo que lo del móvil sea igual o
 *   más nuevo (una edición hecha aquí que aún no ha subido), o que se haya
 *   borrado después (graveyard).
 * - Lo borrado se quita, salvo que se haya vuelto a guardar después.
 * Sin hora (aún sin subir, o de antes de la 2.0.5) cuenta como lo más nuevo.
 * Si no cambia nada, devuelve la misma lista: así no se vuelve a guardar.
 */
export const mergeChanges = <T extends Versioned>(
  local: T[], changed: T[], deleted: Versioned[], graveyard?: Map<string, number>,
): T[] => {
  const byId = new Map(local.map((doc) => [doc.id, doc]));
  let touched = false;
  if (graveyard) {
    for (const gone of deleted) {
      if (gone.updatedAt != null && !(gone.updatedAt <= (graveyard.get(gone.id) ?? -Infinity))) {
        graveyard.set(gone.id, gone.updatedAt);
      }
    }
  }
  for (const doc of changed) {
    // Un cambio propio que aún no ha subido (sin hora) sí entra
    if (doc.updatedAt != null && isBuried(graveyard, doc)) continue;
    const mine = byId.get(doc.id);
    if (!mine || mine.updatedAt == null || doc.updatedAt == null || doc.updatedAt > mine.updatedAt) {
      byId.set(doc.id, doc);
      touched = true;
    }
  }
  for (const gone of deleted) {
    const mine = byId.get(gone.id);
    if (mine && (mine.updatedAt == null || gone.updatedAt == null || mine.updatedAt < gone.updatedAt)) {
      byId.delete(gone.id);
      touched = true;
    }
  }
  return touched ? [...byId.values()] : local;
};

/** Tras juntar lo cambiado con la copia y guardarla */
export const advanceMarks = (collection: CloudCollection, scope: string, changed: Versioned[], deleted: Versioned[]) =>
  Promise.all([
    advanceMark(collection, scope, latestUpdate(changed)),
    advanceMark(DELETED[collection], scope, latestUpdate(deleted)),
  ]);

/**
 * Tras bajar entera una colección y guardarla. Lo borrado antes de esa lectura
 * ya no venía en ella: sus apuntes de borrado se pueden saltar.
 */
export const advanceMarksAfterFullRead = (collection: CloudCollection, scope: string, docs: Versioned[]) => {
  const latest = latestUpdate(docs);
  return Promise.all([advanceMark(collection, scope, latest), advanceMark(DELETED[collection], scope, latest)]);
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

/** Al cerrar sesión: quien entre después empieza comprobando entero (y sin marcas) */
export const removeCloudChecks = async () => {
  graveyards.clear();
  const keys = await AsyncStorage.getAllKeys();
  const ours = keys.filter((k) => k.startsWith(`${CHECK_KEY}_`));
  if (ours.length > 0) await AsyncStorage.multiRemove(ours);
  useCloudCheckStore.setState({ checkedAt: {} });
};
