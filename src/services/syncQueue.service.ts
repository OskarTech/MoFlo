import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
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

const QUEUE_KEY = '@moflo_sync_queue';
const MAX_ATTEMPTS = 5;

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

export type QueueOperation = QueueOperationData & { attempts?: number };

// ── CARGAR COLA ────────────────────────────────────────────────
export const loadQueue = async (): Promise<QueueOperation[]> => {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
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
  queue.push(operation);
  await saveQueue(queue);
};

// ── PROCESAR COLA (cuando hay internet) ───────────────────────
export const processQueue = async (): Promise<void> => {
  const state = await NetInfo.fetch();
  if (!state.isConnected) return;

  const queue = await loadQueue();
  if (queue.length === 0) return;

  console.log(`Processing sync queue: ${queue.length} operations`);

  const failed: QueueOperation[] = [];

  let dropped = 0;

  for (const operation of queue) {
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
        console.error(`Dropping queue op after ${MAX_ATTEMPTS} attempts:`, operation.type, e);
        dropped += 1;
      } else {
        console.error(`Queue op failed (attempt ${attempts}/${MAX_ATTEMPTS}):`, operation.type, e);
        failed.push({ ...operation, attempts } as QueueOperation);
      }
    }
  }

  // Guarda solo las operaciones que fallaron
  await saveQueue(failed);

  if (failed.length === 0 && dropped === 0) {
    console.log('Sync queue processed successfully');
  } else {
    console.log(`${failed.length} pending, ${dropped} dropped`);
  }
};