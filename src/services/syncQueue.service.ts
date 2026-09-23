import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import auth from '@react-native-firebase/auth';
import {
  addMovementToFirestore,
  deleteMovementFromFirestore,
  addRecurringToFirestore,
  deleteRecurringFromFirestore,
  addSharedMovementToFirestore,
  deleteSharedMovementFromFirestore,
  addSharedRecurringToFirestore,
  deleteSharedRecurringFromFirestore,
} from './firebase/firestore.service';
import { Movement, RecurringMovement } from '../types';
import { reportError } from './crashReporting';

const QUEUE_KEY = '@moflo_sync_queue';
const MAX_ATTEMPTS = 5;
// Una operación que lleva un mes sin poder subir ya no le sirve a nadie:
// se descarta para que la cola de un usuario que no vuelve no crezca sin fin.
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

let isProcessing = false;

// Tipos de operaciones en cola
type QueueOperationData =
  | { type: 'ADD_MOVEMENT'; payload: Movement }
  | { type: 'DELETE_MOVEMENT'; payload: string }
  | { type: 'ADD_RECURRING'; payload: RecurringMovement }
  | { type: 'DELETE_RECURRING'; payload: string }
  | { type: 'ADD_SHARED_MOVEMENT'; payload: Movement & { addedBy: string }; accountId: string }
  | { type: 'DELETE_SHARED_MOVEMENT'; payload: string; accountId: string }
  | { type: 'ADD_SHARED_RECURRING'; payload: RecurringMovement; accountId: string }
  | { type: 'DELETE_SHARED_RECURRING'; payload: string; accountId: string };

export type QueueOperation = QueueOperationData & {
  attempts?: number;
  /**
   * Identificador propio de la operación. Al terminar, processQueue reescribe
   * la cola entera; sin una forma de saber qué se acababa de procesar, todo lo
   * que la app hubiera encolado mientras tanto se perdía sin aviso.
   */
  opId?: string;
  /**
   * Dueño de la operación. Las operaciones individuales se escriben en
   * `users/{uid}` leyendo el usuario activo en el momento de subirlas, así que
   * la cola tiene que saber de quién es cada una para no meter los datos de una
   * persona en la cuenta de otra.
   */
  uid?: string;
  queuedAt?: string;
};

const newOpId = (): string =>
  `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

// ── CARGAR COLA ────────────────────────────────────────────────
export const loadQueue = async (): Promise<QueueOperation[]> => {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// ── GUARDAR COLA ───────────────────────────────────────────────
export const saveQueue = async (queue: QueueOperation[]): Promise<void> => {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
};

// ── AÑADIR OPERACIÓN A LA COLA ─────────────────────────────────
export const enqueue = async (operation: QueueOperation): Promise<void> => {
  const queue = await loadQueue();
  queue.push({
    ...operation,
    opId: operation.opId ?? newOpId(),
    uid: operation.uid ?? auth().currentUser?.uid,
    queuedAt: operation.queuedAt ?? new Date().toISOString(),
  });
  await saveQueue(queue);
};

// ── PROCESAR COLA (cuando hay internet) ───────────────────────
export const processQueue = async (): Promise<void> => {
  if (isProcessing) return;
  const state = await NetInfo.fetch();
  if (!state.isConnected) return;

  const uid = auth().currentUser?.uid;
  if (!uid) return;

  const stored = await loadQueue();
  if (stored.length === 0) return;

  isProcessing = true;
  try {
    const now = Date.now();

    // Operaciones anteriores a esta versión: no llevaban dueño ni fecha. Hasta
    // ahora la cola se vaciaba al cerrar sesión, así que lo que haya guardado
    // solo puede ser del usuario que tiene la sesión abierta.
    const normalized: QueueOperation[] = stored.map((op) => ({
      ...op,
      opId: op.opId ?? newOpId(),
      uid: op.uid ?? uid,
      queuedAt: op.queuedAt ?? new Date().toISOString(),
    }));

    const mine: QueueOperation[] = [];
    const others: QueueOperation[] = [];
    let expired = 0;

    for (const op of normalized) {
      const queuedAt = new Date(op.queuedAt!).getTime();
      if (Number.isFinite(queuedAt) && now - queuedAt > MAX_AGE_MS) {
        expired += 1;
        continue;
      }
      // De otro usuario: se deja intacta hasta que vuelva a entrar en la app
      if (op.uid === uid) mine.push(op);
      else others.push(op);
    }

    // Se guarda ya con los identificadores puestos: al terminar hay que poder
    // distinguir lo procesado de lo que se haya encolado entretanto.
    await saveQueue([...others, ...mine]);

    if (mine.length === 0) {
      if (__DEV__ && expired > 0) console.log(`Sync queue: ${expired} caducadas`);
      return;
    }

    if (__DEV__) console.log(`Processing sync queue: ${mine.length} operations`);

    const failed: QueueOperation[] = [];
    let dropped = 0;

    const aborted: QueueOperation[] = [];

    for (const operation of mine) {
      // El cierre de sesión intenta vaciar la cola con un tope de 5 segundos y
      // sigue adelante si tarda más. Sin esta comprobación, las operaciones que
      // quedasen fallarían todas con "no hay usuario" y gastarían un intento
      // cada una: a los cinco cierres de sesión lentos se descartarían y se
      // perdería el movimiento. No es un fallo suyo, así que no cuentan.
      if (auth().currentUser?.uid !== uid) {
        aborted.push(operation);
        continue;
      }

      try {
        switch (operation.type) {
          case 'ADD_MOVEMENT':
            await addMovementToFirestore(operation.payload);
            break;
          case 'DELETE_MOVEMENT':
            await deleteMovementFromFirestore(operation.payload);
            break;
          case 'ADD_RECURRING':
            await addRecurringToFirestore(operation.payload);
            break;
          case 'DELETE_RECURRING':
            await deleteRecurringFromFirestore(operation.payload);
            break;
          case 'ADD_SHARED_MOVEMENT':
            await addSharedMovementToFirestore(operation.accountId, operation.payload);
            break;
          case 'DELETE_SHARED_MOVEMENT':
            await deleteSharedMovementFromFirestore(operation.accountId, operation.payload);
            break;
          case 'ADD_SHARED_RECURRING':
            await addSharedRecurringToFirestore(operation.accountId, operation.payload);
            break;
          case 'DELETE_SHARED_RECURRING':
            await deleteSharedRecurringFromFirestore(operation.accountId, operation.payload);
            break;
        }
      } catch (e) {
        const attempts = (operation.attempts ?? 0) + 1;
        if (attempts >= MAX_ATTEMPTS) {
          // Tras MAX_ATTEMPTS intentos descartamos para que la cola no crezca infinita
          // (ej. doc borrado en otro dispositivo, payload corrupto, etc.)
          reportError(e, `syncQueue drop ${operation.type} tras ${MAX_ATTEMPTS} intentos`);
          dropped += 1;
        } else {
          if (__DEV__) {
            console.warn(`Queue op failed (attempt ${attempts}/${MAX_ATTEMPTS}):`, operation.type, e);
          }
          failed.push({ ...operation, attempts } as QueueOperation);
        }
      }
    }

    // Se relee en vez de escribir `failed` a secas: durante el proceso la app
    // ha podido encolar movimientos nuevos, y antes se quedaban machacados.
    const current = await loadQueue();
    const handled = new Set(mine.map((op) => op.opId));
    const keep = current.filter((op) => !op.opId || !handled.has(op.opId));

    // Las abortadas vuelven a la cola con su contador de intentos intacto
    await saveQueue([...failed, ...aborted, ...keep]);

    if (__DEV__) {
      console.log(
        `Sync queue: ${failed.length} pendientes, ${aborted.length} abortadas, ${dropped} descartadas, ${expired} caducadas`,
      );
    }
  } finally {
    isProcessing = false;
  }
};

/**
 * Cuántas operaciones quedan por subir del usuario activo. Lo usa el cierre de
 * sesión para decidir si merece la pena avisar de que hay cambios sin sincronizar.
 */
export const pendingCountForCurrentUser = async (): Promise<number> => {
  const uid = auth().currentUser?.uid;
  if (!uid) return 0;
  const queue = await loadQueue();
  // Sin uid: cola anterior a esta versión, que solo puede ser del usuario activo
  return queue.filter((op) => !op.uid || op.uid === uid).length;
};

/**
 * Descarta lo pendiente de un usuario concreto y respeta lo de los demás.
 * Lo usa el borrado de cuenta: esas operaciones apuntan a documentos que ya no
 * existen, pero la cola puede tener también las de otra persona que use el móvil.
 */
export const clearQueueForUser = async (uid: string): Promise<void> => {
  const queue = await loadQueue();
  const remaining = queue.filter((op) => !!op.uid && op.uid !== uid);
  await saveQueue(remaining);
};
