import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import { Movement, RecurringMovement } from '../../types';
import { getDeviceLanguage } from '../../i18n';
import { deleteFromCloud, forCloud, fromCloud } from './cloudSync';

// ── HELPERS ────────────────────────────────────────────────────

const getUserId = (): string => {
  const user = auth().currentUser;
  if (!user) throw new Error('No user logged in');
  return user.uid;
};

const getUserCollections = () => {
  const uid = getUserId();
  return {
    movements: firestore().collection('users').doc(uid).collection('movements'),
    recurring: firestore().collection('users').doc(uid).collection('recurring'),
    settings: firestore().collection('users').doc(uid),
  };
};

// ── MOVIMIENTOS ────────────────────────────────────────────────

// Con la hora del servidor (ver cloudCheck)
export const addMovementToFirestore = async (
  movement: Movement
): Promise<void> => {
  const { movements: col } = getUserCollections();
  await col.doc(movement.id).set(forCloud(movement));
};

// Con el apunte del borrado, para que lo vean los demás móviles (ver cloudCheck)
export const deleteMovementFromFirestore = async (
  id: string
): Promise<void> => {
  await deleteFromCloud(null, 'movements', id);
};

// fromServer: si es false, la respuesta es de la caché de Firestore (sin
// conexión con el servidor) y puede estar incompleta
export interface CloudList<T> {
  docs: T[];
  fromServer: boolean;
}

export const fetchMovementsFromFirestore = async (): Promise<CloudList<Movement>> => {
  const { movements: col } = getUserCollections();
  const snapshot = await col.get();
  return { docs: snapshot.docs.map((doc) => fromCloud<Movement>(doc)), fromServer: !snapshot.metadata.fromCache };
};

/** Si hay al menos un movimiento en la nube; null si no se ha podido saber */
export const hasMovementsInFirestore = async (): Promise<boolean | null> => {
  const { movements: col } = getUserCollections();
  const snapshot = await col.limit(1).get();
  return snapshot.metadata.fromCache ? null : !snapshot.empty;
};

export const syncMovementsToFirestore = async (
  movements: Movement[]
): Promise<void> => {
  const { movements: col } = getUserCollections();
  const batch = firestore().batch();
  movements.forEach((m) => {
    batch.set(col.doc(m.id), forCloud(m));
  });
  await batch.commit();
};

// ── RECURRENTES ────────────────────────────────────────────────

export const addRecurringToFirestore = async (
  recurring: RecurringMovement
): Promise<void> => {
  const { recurring: col } = getUserCollections();
  // Sin campos undefined (p. ej. sin descripción): Firestore rechaza la escritura entera
  const sanitized = Object.fromEntries(
    Object.entries(recurring).filter(([_, v]) => v !== undefined)
  );
  await col.doc(recurring.id).set(sanitized);
};

export const deleteRecurringFromFirestore = async (
  id: string
): Promise<void> => {
  const { recurring: col } = getUserCollections();
  await col.doc(id).delete();
};

export const fetchRecurringFromFirestore = async (): Promise<CloudList<RecurringMovement>> => {
  const { recurring: col } = getUserCollections();
  const snapshot = await col.get();
  return { docs: snapshot.docs.map((doc) => doc.data() as RecurringMovement), fromServer: !snapshot.metadata.fromCache };
};

// ── SETTINGS ───────────────────────────────────────────────────

interface UserSettings {
  displayName: string;
  currencyCode: string;
  language: string;
  themeMode: string;
  dateFormat?: string;
  colorPalette?: string;
  hapticsEnabled?: boolean;
  photoURL?: string | null;
  monthStartDay?: number;
}

export const saveSettingsToFirestore = async (
  settings: UserSettings
): Promise<void> => {
  const { settings: doc } = getUserCollections();
  await doc.set({ settings }, { merge: true });
};

export const fetchSettingsFromFirestore = async (): Promise<UserSettings | null> => {
  const { settings: doc } = getUserCollections();
  const snapshot = await doc.get();
  const data = snapshot.data();
  return data?.settings ?? null;
};

// ── CUENTAS COMPARTIDAS ────────────────────────────────────────

const sharedMovementsCol = (accountId: string) =>
  firestore().collection('sharedAccounts').doc(accountId).collection('movements');

const sharedRecurringCol = (accountId: string) =>
  firestore().collection('sharedAccounts').doc(accountId).collection('recurring');

export const addSharedMovementToFirestore = async (
  accountId: string,
  movement: Movement & { addedBy: string }
): Promise<void> => {
  await sharedMovementsCol(accountId).doc(movement.id).set(forCloud(movement));
};

export const deleteSharedMovementFromFirestore = async (
  accountId: string,
  id: string
): Promise<void> => {
  await deleteFromCloud(accountId, 'movements', id);
};

export const addSharedRecurringToFirestore = async (
  accountId: string,
  recurring: RecurringMovement
): Promise<void> => {
  const sanitized = Object.fromEntries(
    Object.entries(recurring).filter(([_, v]) => v !== undefined)
  );
  await sharedRecurringCol(accountId).doc(recurring.id).set(sanitized);
};

export const deleteSharedRecurringFromFirestore = async (
  accountId: string,
  id: string
): Promise<void> => {
  await sharedRecurringCol(accountId).doc(id).delete();
};

// ── INICIALIZAR USUARIO NUEVO ──────────────────────────────────

export const initializeNewUser = async (displayName: string): Promise<void> => {
  const uid = getUserId();
  const userDoc = firestore().collection('users').doc(uid);
  const snapshot = await userDoc.get();

  // exists() es un método: con `!snapshot.exists` nunca se guardaban estos datos.
  // También se comprueba displayName por si al arrancar ya se guardó solo el idioma.
  if (!snapshot.exists() || !snapshot.data()?.settings?.displayName) {
    await userDoc.set({
      settings: {
        displayName,
        currencyCode: 'EUR',
        language: getDeviceLanguage(),
        themeMode: 'auto',
        dateFormat: 'DD/MM/YYYY',
      },
      createdAt: new Date().toISOString(),
    }, { merge: true });
  }
};