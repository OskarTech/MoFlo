import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import {
  CloudCollection, DELETED, DELETION_TTL_MS, SyncStream, advanceMark, changesSince, latestUpdate, readMark,
} from '../../store/cloudCheck';
import { reportError } from '../crashReporting';

/**
 * Los movimientos y los movimientos de huchas en la nube, con la hora del
 * servidor de su último cambio y el apunte de cada borrado (ver cloudCheck).
 * Todo lo que los sube, los borra o pide sus cambios pasa por aquí.
 */

type Collection = FirebaseFirestoreTypes.CollectionReference;
type Snapshot = FirebaseFirestoreTypes.DocumentSnapshot;
type Batch = FirebaseFirestoreTypes.WriteBatch;

/** La cuenta: la del usuario (accountId null) o la compartida */
const accountDoc = (accountId: string | null) => {
  if (accountId) return firestore().collection('sharedAccounts').doc(accountId);
  const uid = auth().currentUser?.uid;
  if (!uid) throw new Error('No user logged in');
  return firestore().collection('users').doc(uid);
};

export const cloudCollection = (accountId: string | null, collection: CloudCollection): Collection =>
  accountDoc(accountId).collection(collection);

export const deletedCollection = (accountId: string | null, collection: CloudCollection): Collection =>
  accountDoc(accountId).collection(DELETED[collection]);

// La hora de Firestore en ms. Sin ella (de antes de la 2.0.5, o aún sin
// subir), undefined
const millisOf = (value: unknown): number | undefined =>
  value != null && typeof (value as { toMillis?: unknown }).toMillis === 'function'
    ? (value as FirebaseFirestoreTypes.Timestamp).toMillis()
    : undefined;

/** Un documento de la nube como lo guarda el móvil: con su id y la hora en ms */
export const fromCloud = <T extends { id: string }>(doc: Snapshot): T => {
  const { updatedAt, ...data } = (doc.data() ?? {}) as Record<string, unknown>;
  const at = millisOf(updatedAt);
  return { ...data, id: doc.id, ...(at != null ? { updatedAt: at } : {}) } as unknown as T;
};

/** Un apunte de borrado: qué documento y a qué hora */
export const deletionFromCloud = (doc: Snapshot): { id: string; updatedAt?: number } => {
  const at = millisOf(doc.data()?.updatedAt);
  return at != null ? { id: doc.id, updatedAt: at } : { id: doc.id };
};

/**
 * Lo que se sube de un movimiento: sin campos undefined (Firestore rechazaría
 * la escritura entera) y con la hora del servidor, nunca la que traiga del móvil
 */
export const forCloud = (doc: object): Record<string, unknown> => {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc)) {
    if (value !== undefined && key !== 'updatedAt') data[key] = value;
  }
  data.updatedAt = firestore.FieldValue.serverTimestamp();
  return data;
};

/** Para un update: la hora del servidor, junto a los campos que cambian */
export const changedNow = () => ({ updatedAt: firestore.FieldValue.serverTimestamp() });

/**
 * Añade a un lote el borrado de un documento y, si withRecord, su apunte: así
 * los demás móviles se enteran sin bajarlo todo
 */
export const deleteInBatch = (
  batch: Batch, accountId: string | null, collection: CloudCollection, id: string, withRecord: boolean,
) => {
  batch.delete(cloudCollection(accountId, collection).doc(id));
  if (withRecord) {
    batch.set(deletedCollection(accountId, collection).doc(id), {
      updatedAt: firestore.FieldValue.serverTimestamp(),
      expireAt: firestore.Timestamp.fromMillis(Date.now() + DELETION_TTL_MS),
    });
  }
};

const isPermissionDenied = (e: unknown) => (e as { code?: string })?.code === 'firestore/permission-denied';

/**
 * Sube un lote con borrados y sus apuntes. Si las reglas aún no dejan guardar
 * los apuntes, se sube sin ellos: el borrado se hace igual y los demás móviles
 * lo ven en la comprobación entera, como antes. Si falla por otra cosa, o sin
 * apuntes también, el error sigue hacia arriba como siempre.
 */
export const commitWithDeletions = async (build: (batch: Batch, withRecord: boolean) => void) => {
  const batch = firestore().batch();
  build(batch, true);
  try {
    await batch.commit();
  } catch (e) {
    if (!isPermissionDenied(e)) throw e;
    const plain = firestore().batch();
    build(plain, false);
    await plain.commit();
    reportError(e, 'borrado sin apunte: las reglas no lo dejan guardar');
  }
};

/** Borra un movimiento o un movimiento de hucha, con su apunte */
export const deleteFromCloud = (accountId: string | null, collection: CloudCollection, id: string) =>
  commitWithDeletions((batch, withRecord) => deleteInBatch(batch, accountId, collection, id, withRecord));

/** Lo guardado desde la marca, con unos minutos de margen (ver cloudCheck) */
export const changesQuery = (col: Collection, mark: number | null) =>
  col.where('updatedAt', '>=', firestore.Timestamp.fromMillis(changesSince(mark)));

export interface CloudChanges<T> {
  changed: T[];
  deleted: { id: string; updatedAt?: number }[];
  /** Si es la respuesta del servidor: la de la caché de Firestore puede estar incompleta */
  fromServer: boolean;
}

/** Lo cambiado y lo borrado desde la última vez: scope es el uid o el id de la compartida */
export const fetchCloudChanges = async <T extends { id: string }>(
  accountId: string | null, collection: CloudCollection, scope: string,
): Promise<CloudChanges<T>> => {
  const [changedMark, deletedMark] = await Promise.all([
    readMark(collection, scope),
    readMark(DELETED[collection], scope),
  ]);
  const [changedSnap, deletedSnap] = await Promise.all([
    changesQuery(cloudCollection(accountId, collection), changedMark).get(),
    // Si las reglas aún no dejan leer los apuntes (la app publicada antes que
    // ellas), lo cambiado llega igual, y lo borrado con la comprobación entera
    changesQuery(deletedCollection(accountId, collection), deletedMark).get()
      .catch((e) => {
        if (!isPermissionDenied(e)) throw e;
        return null;
      }),
  ]);
  return {
    changed: changedSnap.docs.map((d) => fromCloud<T>(d)),
    deleted: deletedSnap ? deletedSnap.docs.map(deletionFromCloud) : [],
    fromServer: !changedSnap.metadata.fromCache && !deletedSnap?.metadata.fromCache,
  };
};

type Deletion = { id: string; updatedAt?: number };

/**
 * Escucha en directo lo cambiado y lo borrado de una colección de la cuenta
 * compartida, desde la marca. apply lo junta con la copia, la guarda y dice si
 * lo ha hecho. Primero se leen las marcas: devuelve cómo dejar de escuchar,
 * también si aún no había empezado.
 *
 * De cada aviso se junta solo lo que cambia (docChanges), también de los de la
 * caché: Firestore no repite lo que ya avisó, y un documento que solo sigue
 * ahí no es nuevo. Así no vuelve lo que se ha borrado en este móvil sin
 * conexión mientras Firestore lo vuelve a enviar al recuperarla. La marca sube
 * solo con los avisos del servidor y cuando ya está guardado lo anterior.
 *
 * Si falla la escucha de lo cambiado (p. ej., ya no es miembro), se cierran
 * las dos y se avisa con onError. Si falla solo la de los apuntes de borrado
 * (las reglas aún no la dejan), lo cambiado sigue llegando en directo y lo
 * borrado llega con la comprobación entera.
 */
export const listenToCloudChanges = <T extends { id: string; updatedAt?: number }>(
  accountId: string,
  collection: CloudCollection,
  apply: (changed: T[], deleted: Deletion[]) => Promise<boolean>,
  onError: (e: unknown) => void,
): (() => void) => {
  let stopped = false;
  const stops: (() => void)[] = [];
  const stopAll = () => {
    stopped = true;
    stops.forEach((stop) => stop());
  };

  const listen = <D extends Deletion>(
    col: Collection, mark: number | null, stream: SyncStream,
    parse: (doc: Snapshot) => D, merge: (list: D[]) => Promise<boolean>, fail: (e: unknown) => void,
  ) => {
    let previous: Promise<unknown> = Promise.resolve();
    return changesQuery(col, mark).onSnapshot((snap) => {
      // Lo borrado de la nube llega por los apuntes, no porque un documento
      // salga de aquí (también sale si una versión anterior lo edita)
      const changed = snap.docChanges().filter((c) => c.type !== 'removed').map((c) => parse(c.doc));
      const seen = snap.metadata.fromCache ? null : snap.docs.map(parse);
      previous = previous
        .then(() => merge(changed))
        .then((merged) => (merged && seen ? advanceMark(stream, accountId, latestUpdate(seen)) : undefined))
        .catch((e) => reportError(e, `escucha de ${stream}: al guardar`));
    }, fail);
  };

  Promise.all([readMark(collection, accountId), readMark(DELETED[collection], accountId)])
    .then(([changedMark, deletedMark]) => {
      if (stopped) return;
      stops.push(listen(
        cloudCollection(accountId, collection), changedMark, collection,
        (doc) => fromCloud<T>(doc), (list) => apply(list, []),
        (e) => {
          stopAll();
          onError(e);
        },
      ));
      stops.push(listen(
        deletedCollection(accountId, collection), deletedMark, DELETED[collection],
        deletionFromCloud, (list) => apply([], list),
        (e) => reportError(e, `escucha de ${DELETED[collection]}`),
      ));
    })
    .catch(onError);

  return stopAll;
};
