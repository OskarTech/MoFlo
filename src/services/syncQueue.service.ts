import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import {
  addMovementToFirestore,
  deleteMovementFromFirestore,
  addRecurringToFirestore,
  deleteRecurringFromFirestore,
} from './firebase/firestore.service';
import { Movement, RecurringMovement } from '../types';

const QUEUE_KEY = '@moflo_sync_queue';

// Tipos de operaciones en cola
export type QueueOperation =
  | { type: 'ADD_MOVEMENT'; payload: Movement }
  | { type: 'DELETE_MOVEMENT'; payload: string }
  | { type: 'ADD_RECURRING'; payload: RecurringMovement }
  | { type: 'DELETE_RECURRING'; payload: string };

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
      }
    } catch (e) {
      // Si falla, lo volvemos a añadir a la cola
      console.error('Queue operation failed:', e);
      failed.push(operation);
    }
  }

  // Guarda solo las operaciones que fallaron
  await saveQueue(failed);

  if (failed.length === 0) {
    console.log('Sync queue processed successfully');
  } else {
    console.log(`${failed.length} operations remaining in queue`);
  }
};