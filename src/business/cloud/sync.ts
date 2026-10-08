import AsyncStorage from '@react-native-async-storage/async-storage';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { latestUpdate } from '../../store/cloudCheck';
import { changesQuery, deletionFromCloud, fromCloud } from '../../services/firebase/cloudSync';
import { reportError } from '../../services/crashReporting';
import { BizCollection, BIZ_DELETED, bizCol, bizDeletedCol } from './refs';

/**
 * Lo que se baja de la empresa: como en las otras cuentas, solo lo cambiado
 * desde la última vez, por la hora del servidor (ver cloudCheck). Cada móvil
 * recuerda por empresa y colección la hora más reciente que le ha llegado.
 *
 * Las marcas van con el prefijo de las de cloudCheck: al cerrar sesión las
 * borra removeCloudChecks junto con las demás.
 */

type Query = FirebaseFirestoreTypes.Query;
type Snapshot = FirebaseFirestoreTypes.DocumentSnapshot;

export type BizStream = BizCollection | 'deletedExpenses' | 'deletedRecurring';
export type Deletion = { id: string; updatedAt?: number };

const markKey = (stream: BizStream, businessId: string) => `@moflo_cloud_check_mark_biz_${stream}_${businessId}`;

export const readBizMark = async (stream: BizStream, businessId: string): Promise<number | null> => {
  const at = Number(await AsyncStorage.getItem(markKey(stream, businessId)));
  return Number.isFinite(at) && at > 0 ? at : null;
};

/** Sube la marca, nunca la baja. Después de guardar la copia del móvil */
export const advanceBizMark = async (stream: BizStream, businessId: string, at: number | null) => {
  if (at == null) return;
  const current = await readBizMark(stream, businessId);
  if (current != null && current >= at) return;
  await AsyncStorage.setItem(markKey(stream, businessId), String(at));
};

const isPermissionDenied = (e: unknown) => (e as { code?: string })?.code === 'firestore/permission-denied';

export interface BizChanges<T> {
  changed: T[];
  deleted: Deletion[];
  fromServer: boolean;
  /** Se bajó con `initial` (sin marca): lo que no venga en esa ventana no se toca */
  initial: boolean;
}

/**
 * Lo cambiado y lo borrado desde la marca. Sin marca (un móvil nuevo), con
 * `initial` se pide solo una ventana (los pedidos de las últimas semanas, no
 * todos los de la historia); sin `initial`, la colección entera
 */
export const fetchBizChanges = async <T extends { id: string }>(
  businessId: string,
  collection: BizCollection,
  initial?: (col: FirebaseFirestoreTypes.CollectionReference) => Query,
): Promise<BizChanges<T>> => {
  const deletedStream = BIZ_DELETED[collection] as BizStream | undefined;
  const [mark, deletedMark] = await Promise.all([
    readBizMark(collection, businessId),
    deletedStream ? readBizMark(deletedStream, businessId) : Promise.resolve(null),
  ]);
  const col = bizCol(businessId, collection);
  const useInitial = mark == null && !!initial;
  const deletedCol = bizDeletedCol(businessId, collection);
  const [snap, deletedSnap] = await Promise.all([
    (useInitial && initial ? initial(col) : changesQuery(col, mark)).get(),
    // Sin marca no hay borrados que recoger: lo borrado ya no viene en la lectura
    deletedCol && mark != null
      ? changesQuery(deletedCol, deletedMark).get().catch((e) => {
        if (!isPermissionDenied(e)) throw e;
        return null;
      })
      : Promise.resolve(null),
  ]);
  return {
    changed: snap.docs.map((d) => fromCloud<T>(d)),
    deleted: deletedSnap ? deletedSnap.docs.map(deletionFromCloud) : [],
    fromServer: !snap.metadata.fromCache && !deletedSnap?.metadata.fromCache,
    initial: useInitial,
  };
};

// Igual con las claves en cualquier orden (las de Firestore no lo guardan)
const stableJson = (value: unknown): string => JSON.stringify(value, (_key, v) => (
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
    : v
));

/**
 * La copia del móvil con lo que llega de la nube, como mergeChanges
 * (cloudCheck), y además lo que llega del servidor gana a igual hora. Al
 * subir un cambio de un campo (una caja, el cierre), Firestore enseña primero
 * el documento con lo de este móvil y la hora nueva, y un momento después el
 * del servidor, con lo que otro socio guardó a la vez y la misma hora: sin
 * esto, la caja del otro no se veía hasta el siguiente cambio del día
 */
export const mergeBizChanges = <T extends { id: string; updatedAt?: number }>(
  local: T[], changed: T[], deleted: Deletion[], fromServer: boolean,
): T[] => {
  const byId = new Map(local.map((doc) => [doc.id, doc]));
  let touched = false;
  for (const doc of changed) {
    const mine = byId.get(doc.id);
    const newer = !mine || mine.updatedAt == null || doc.updatedAt == null || doc.updatedAt > mine.updatedAt
      || (fromServer && doc.updatedAt === mine.updatedAt && stableJson(doc) !== stableJson(mine));
    if (newer) {
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

/** Tras guardar lo bajado: las marcas suben a lo más reciente que ha llegado */
export const advanceBizMarks = async (
  businessId: string, collection: BizCollection, changes: BizChanges<{ id: string; updatedAt?: number }>,
) => {
  const latest = latestUpdate(changes.changed);
  await advanceBizMark(collection, businessId, latest);
  const deletedStream = BIZ_DELETED[collection] as BizStream | undefined;
  if (!deletedStream) return;
  // Tras una lectura entera, lo borrado antes ya no venía: sus apuntes se saltan
  await advanceBizMark(deletedStream, businessId, changes.initial ? latest : latestUpdate(changes.deleted));
};

/**
 * Escucha en directo lo cambiado de una colección desde la marca, como
 * listenToCloudChanges en la compartida: de cada aviso solo lo que cambia, y
 * la marca sube con los avisos del servidor una vez guardado lo anterior.
 * apply lo junta con la copia (fromServer: si el aviso es del servidor), la
 * guarda y dice si lo ha hecho
 */
export const listenBizChanges = <T extends { id: string; updatedAt?: number }>(
  businessId: string,
  collection: BizCollection,
  apply: (changed: T[], deleted: Deletion[], fromServer: boolean) => Promise<boolean>,
  onError: (e: unknown) => void,
  /** Sin marca, la misma ventana que fetchBizChanges: no la colección entera */
  initial?: (col: FirebaseFirestoreTypes.CollectionReference) => Query,
): (() => void) => {
  let stopped = false;
  const stops: (() => void)[] = [];
  const stopAll = () => {
    stopped = true;
    stops.forEach((stop) => stop());
  };

  const listen = <D extends Deletion>(
    query: Query, stream: BizStream, parse: (doc: Snapshot) => D,
    merge: (list: D[], fromServer: boolean) => Promise<boolean>, fail: (e: unknown) => void,
  ) => {
    let previous: Promise<unknown> = Promise.resolve();
    return query.onSnapshot((snap) => {
      const changed = snap.docChanges().filter((c) => c.type !== 'removed').map((c) => parse(c.doc));
      const seen = snap.metadata.fromCache ? null : snap.docs.map(parse);
      previous = previous
        .then(() => (changed.length ? merge(changed, !snap.metadata.fromCache) : Promise.resolve(true)))
        .then((merged) => (merged && seen ? advanceBizMark(stream, businessId, latestUpdate(seen)) : undefined))
        .catch((e) => reportError(e, `empresa: escucha de ${stream}`));
    }, fail);
  };

  const deletedStream = BIZ_DELETED[collection] as BizStream | undefined;
  Promise.all([
    readBizMark(collection, businessId),
    deletedStream ? readBizMark(deletedStream, businessId) : Promise.resolve(null),
  ])
    .then(([mark, deletedMark]) => {
      if (stopped) return;
      const col = bizCol(businessId, collection);
      stops.push(listen(
        mark == null && initial ? initial(col) : changesQuery(col, mark), collection,
        (doc) => fromCloud<T>(doc), (list, fromServer) => apply(list, [], fromServer),
        (e) => {
          stopAll();
          onError(e);
        },
      ));
      const deletedCol = bizDeletedCol(businessId, collection);
      if (deletedCol && deletedStream) {
        stops.push(listen(
          changesQuery(deletedCol, deletedMark), deletedStream,
          deletionFromCloud, (list, fromServer) => apply([], list, fromServer),
          (e) => reportError(e, `empresa: escucha de ${deletedStream}`),
        ));
      }
    })
    .catch(onError);

  return stopAll;
};
