import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import { Movement, RecurringMovement } from '../../types';

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

export const addMovementToFirestore = async (
  movement: Movement
): Promise<void> => {
  const { movements: col } = getUserCollections();
  const sanitized = Object.fromEntries(
    Object.entries(movement).filter(([_, v]) => v !== undefined)
  );
  await col.doc(movement.id).set(sanitized);
};

export const deleteMovementFromFirestore = async (
  id: string
): Promise<void> => {
  const { movements: col } = getUserCollections();
  await col.doc(id).delete();
};

export const fetchMovementsFromFirestore = async (): Promise<Movement[]> => {
  const { movements: col } = getUserCollections();
  const snapshot = await col.get();
  return snapshot.docs.map((doc) => doc.data() as Movement);
};

export const syncMovementsToFirestore = async (
  movements: Movement[]
): Promise<void> => {
  const { movements: col } = getUserCollections();
  const batch = firestore().batch();
  movements.forEach((m) => {
    const sanitized = Object.fromEntries(
      Object.entries(m).filter(([_, v]) => v !== undefined)
    );
    const ref = col.doc(m.id);
    batch.set(ref, sanitized);
  });
  await batch.commit();
};

// ── RECURRENTES ────────────────────────────────────────────────

export const addRecurringToFirestore = async (
  recurring: RecurringMovement
): Promise<void> => {
  const { recurring: col } = getUserCollections();
  await col.doc(recurring.id).set(recurring);
};

export const deleteRecurringFromFirestore = async (
  id: string
): Promise<void> => {
  const { recurring: col } = getUserCollections();
  await col.doc(id).delete();
};

export const fetchRecurringFromFirestore = async (): Promise<RecurringMovement[]> => {
  const { recurring: col } = getUserCollections();
  const snapshot = await col.get();
  return snapshot.docs.map((doc) => doc.data() as RecurringMovement);
};

// ── SETTINGS ───────────────────────────────────────────────────

interface UserSettings {
  displayName: string;
  currencyCode: string;
  language: string;
  themeMode: string;
  dateFormat?: string;
  colorPalette?: string;
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
  const sanitized = Object.fromEntries(
    Object.entries(movement).filter(([_, v]) => v !== undefined)
  );
  await sharedMovementsCol(accountId).doc(movement.id).set(sanitized);
};

export const deleteSharedMovementFromFirestore = async (
  accountId: string,
  id: string
): Promise<void> => {
  await sharedMovementsCol(accountId).doc(id).delete();
};

export const addSharedRecurringToFirestore = async (
  accountId: string,
  recurring: RecurringMovement
): Promise<void> => {
  await sharedRecurringCol(accountId).doc(recurring.id).set(recurring);
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

  if (!snapshot.exists) {
    await userDoc.set({
      settings: {
        displayName,
        currencyCode: 'EUR',
        language: 'auto',
        themeMode: 'auto',
        dateFormat: 'DD/MM/YYYY',
      },
      createdAt: new Date().toISOString(),
    });
  }
};