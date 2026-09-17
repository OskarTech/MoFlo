import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import * as Notifications from 'expo-notifications';
import { Reminder } from '../types';
import { ANDROID_CHANNEL_ID, ensureNotificationChannel } from '../services/notifications.service';

// Recordatorios individuales: solo en el dispositivo (misma clave que antes)
const individualKey = (uid: string) => `@moflo_reminders_${uid}`;
// Caché local de los recordatorios de la cuenta compartida
const sharedCacheKey = (accountId: string) => `@moflo_shared_reminders_${accountId}`;
// Mapa reminderId → notificationId de este dispositivo para recordatorios compartidos.
// Las notificaciones locales son por dispositivo: cada miembro programa las suyas.
const SHARED_NOTIF_MAP_KEY = '@moflo_shared_reminder_notifs';

let sharedUnsubscribe: (() => void) | null = null;
let subscribedAccountId: string | null = null;
// Cuenta a la que pertenece la lista sharedReminders actual
let listAccountId: string | null = null;
// Recordatorios creados en este dispositivo que aún no han llegado en un snapshot
const pendingIds = new Set<string>();
// Serializa el acceso al mapa de notificaciones para evitar duplicados
let notifChain: Promise<void> = Promise.resolve();

const getSharedRemindersCol = (accountId: string) =>
  firestore().collection('sharedAccounts').doc(accountId).collection('reminders');

const stripUndefined = <T extends Record<string, any>>(obj: T): T =>
  Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined)) as T;

const runExclusive = (task: () => Promise<void>) => {
  notifChain = notifChain.then(task).catch((e) => {
    console.error('Reminder notifications error:', e);
  });
  return notifChain;
};

// Junto al id de notificación se guarda una firma del contenido: así este
// dispositivo detecta que otro miembro editó el recordatorio y la reprograma.
type NotifEntry = { n: string; sig: string };

const sigOf = (r: Reminder) => `${r.title}|${r.date ?? ''}`;

const readNotifMap = async (): Promise<Record<string, NotifEntry>> => {
  try {
    const raw = await AsyncStorage.getItem(SHARED_NOTIF_MAP_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const out: Record<string, NotifEntry> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, any>)) {
      // Formato antiguo: el valor era el id de notificación suelto. Sin firma
      // se reprograma una vez y queda al día.
      out[id] = typeof value === 'string' ? { n: value, sig: '' } : value;
    }
    return out;
  } catch {
    return {};
  }
};

const writeNotifMap = (map: Record<string, NotifEntry>) =>
  AsyncStorage.setItem(SHARED_NOTIF_MAP_KEY, JSON.stringify(map));

export const scheduleReminderNotification = async (
  body: string, date: Date, accountName?: string,
): Promise<string> => {
  if (date.getTime() <= Date.now()) return '';
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return '';
    await ensureNotificationChannel();
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: accountName ? `🔔 MoFlo · ${accountName}` : '🔔 MoFlo',
        body,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date,
        channelId: ANDROID_CHANNEL_ID, // ignorado en iOS
      },
    });
  } catch (e) {
    console.error('Notification error:', e);
    return '';
  }
};

const cancelNotification = async (notificationId: string) => {
  if (!notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {}
};

const getSharedAccountState = () => {
  const { useSharedAccountStore } = require('./sharedAccountStore');
  return useSharedAccountStore.getState();
};

// Programa en este dispositivo los recordatorios compartidos futuros que falten
// y cancela los que otro miembro haya borrado.
const syncSharedNotifications = (
  reminders: Reminder[], accountName: string | undefined, canCancel: boolean,
) => runExclusive(async () => {
  const map = await readNotifMap();
  const byId = new Map(reminders.map(r => [r.id, r] as const));
  let changed = false;

  for (const [reminderId, entry] of Object.entries(map)) {
    const reminder = byId.get(reminderId);
    if (!reminder) {
      // Borrado por otro miembro: solo sobre snapshots del servidor, y nunca
      // sobre los que este dispositivo acaba de crear
      if (!canCancel || pendingIds.has(reminderId)) continue;
    } else if (entry.sig === sigOf(reminder)) {
      continue;
    }
    // Borrado, editado o convertido en nota: la notificación vieja ya no sirve.
    // Si sigue teniendo fecha futura, el bloque siguiente la reprograma.
    await cancelNotification(entry.n);
    delete map[reminderId];
    changed = true;
  }

  // Las notas (sin fecha) no llevan notificación
  const future = reminders.filter(r =>
    !!r.date && map[r.id] === undefined && new Date(r.date).getTime() > Date.now());
  if (future.length > 0) {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') {
      for (const r of future) {
        const notificationId = await scheduleReminderNotification(r.title, new Date(r.date!), accountName);
        if (notificationId) {
          map[r.id] = { n: notificationId, sig: sigOf(r) };
          changed = true;
        }
      }
    }
  }

  if (changed) await writeNotifMap(map);
});

interface ReminderStore {
  reminders: Reminder[];
  sharedReminders: Reminder[];

  loadIndividualReminders: () => Promise<void>;
  addReminder: (data: Omit<Reminder, 'id' | 'createdAt' | 'notificationId' | 'createdBy'>) => Promise<void>;
  updateReminder: (id: string, data: Omit<Reminder, 'id' | 'createdAt' | 'notificationId' | 'createdBy'>) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;

  subscribeToSharedReminders: (accountId: string) => void;
  unsubscribeSharedReminders: (cancelNotifications: boolean) => void;
  resyncSharedNotifications: () => void;
  resetStore: () => void;
}

export const useReminderStore = create<ReminderStore>((set, get) => ({
  reminders: [],
  sharedReminders: [],

  // ── INDIVIDUALES ───────────────────────────────────────────────
  loadIndividualReminders: async () => {
    const uid = auth().currentUser?.uid ?? 'guest';
    try {
      const raw = await AsyncStorage.getItem(individualKey(uid));
      set({ reminders: raw ? JSON.parse(raw) : [] });
    } catch (e) {
      console.error('Error loading reminders:', e);
    }
  },

  // ── AÑADIR ─────────────────────────────────────────────────────
  addReminder: async (data) => {
    const { isSharedMode, sharedAccount } = getSharedAccountState();
    // Sufijo aleatorio: dos miembros creando a la vez no se pisan el documento
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date().toISOString();
    const date = data.date ? new Date(data.date) : null;
    const uid = auth().currentUser?.uid ?? 'guest';

    if (isSharedMode && sharedAccount) {
      const accountId: string = sharedAccount.id;
      const reminder: Reminder = { id, ...data, notificationId: '', createdAt, createdBy: uid };

      // Notificación local de este dispositivo, registrada antes de escribir en Firestore
      // para que el snapshot no la vuelva a programar.
      pendingIds.add(id);
      if (date) await runExclusive(async () => {
        const notificationId = await scheduleReminderNotification(data.title, date, sharedAccount.name);
        if (notificationId) {
          const map = await readNotifMap();
          map[id] = { n: notificationId, sig: sigOf(reminder) };
          await writeNotifMap(map);
        }
      });

      set({ sharedReminders: [reminder, ...get().sharedReminders.filter(r => r.id !== id)] });
      // Sin await: Firestore aplica la escritura en local al instante y la sincroniza
      // cuando haya conexión (no se queda colgado sin internet).
      getSharedRemindersCol(accountId).doc(id).set(stripUndefined(reminder)).catch((e) => {
        console.error('Error saving shared reminder:', e);
      });
      return;
    }

    const notificationId = date ? await scheduleReminderNotification(data.title, date) : '';
    const reminder: Reminder = { id, ...data, notificationId, createdAt };
    const updated = [reminder, ...get().reminders];
    set({ reminders: updated });
    await AsyncStorage.setItem(individualKey(uid), JSON.stringify(updated));
  },

  // ── EDITAR ─────────────────────────────────────────────────────
  updateReminder: async (id, data) => {
    const { isSharedMode, sharedAccount } = getSharedAccountState();
    const date = data.date ? new Date(data.date) : null;

    if (isSharedMode && sharedAccount) {
      const accountId: string = sharedAccount.id;
      const existing = get().sharedReminders.find(r => r.id === id);
      if (!existing) return;
      const reminder: Reminder = { ...existing, ...data, id: existing.id };

      // La notificación se reprograma siempre: pueden haber cambiado título o fecha,
      // y una nota sin fecha no debe conservar la notificación anterior.
      pendingIds.add(id);
      await runExclusive(async () => {
        const map = await readNotifMap();
        if (map[id]) {
          await cancelNotification(map[id].n);
          delete map[id];
        }
        if (date && date.getTime() > Date.now()) {
          const notificationId = await scheduleReminderNotification(data.title, date, sharedAccount.name);
          if (notificationId) map[id] = { n: notificationId, sig: sigOf(reminder) };
        }
        await writeNotifMap(map);
      });

      set({
        sharedReminders: get().sharedReminders.map(r => (r.id === id ? reminder : r)),
      });
      getSharedRemindersCol(accountId).doc(id).set(stripUndefined(reminder)).catch((e) => {
        console.error('Error updating shared reminder:', e);
      });
      return;
    }

    const uid = auth().currentUser?.uid ?? 'guest';
    const existing = get().reminders.find(r => r.id === id);
    if (!existing) return;

    if (existing.notificationId) await cancelNotification(existing.notificationId);
    const notificationId = date && date.getTime() > Date.now()
      ? await scheduleReminderNotification(data.title, date)
      : '';

    const reminder: Reminder = { ...existing, ...data, id: existing.id, notificationId };
    const updated = get().reminders.map(r => (r.id === id ? reminder : r));
    set({ reminders: updated });
    await AsyncStorage.setItem(individualKey(uid), JSON.stringify(updated));
  },

  // ── ELIMINAR ───────────────────────────────────────────────────
  deleteReminder: async (id) => {
    const { isSharedMode, sharedAccount } = getSharedAccountState();

    if (isSharedMode && sharedAccount) {
      const accountId: string = sharedAccount.id;
      pendingIds.delete(id);
      set({ sharedReminders: get().sharedReminders.filter(r => r.id !== id) });
      await runExclusive(async () => {
        const map = await readNotifMap();
        if (map[id]) {
          await cancelNotification(map[id].n);
          delete map[id];
          await writeNotifMap(map);
        }
      });
      // Los demás miembros cancelan su notificación al recibir el snapshot
      getSharedRemindersCol(accountId).doc(id).delete().catch((e) => {
        console.error('Error deleting shared reminder:', e);
      });
      return;
    }

    const uid = auth().currentUser?.uid ?? 'guest';
    const reminder = get().reminders.find(r => r.id === id);
    if (reminder?.notificationId) await cancelNotification(reminder.notificationId);
    const updated = get().reminders.filter(r => r.id !== id);
    set({ reminders: updated });
    await AsyncStorage.setItem(individualKey(uid), JSON.stringify(updated));
  },

  // ── COMPARTIDOS EN TIEMPO REAL ─────────────────────────────────
  // Se mantiene activo mientras el usuario sea miembro (también en modo individual)
  // para que las notificaciones de todos los miembros estén al día.
  subscribeToSharedReminders: (accountId) => {
    if (sharedUnsubscribe && subscribedAccountId === accountId) return;
    if (sharedUnsubscribe) { sharedUnsubscribe(); sharedUnsubscribe = null; }
    subscribedAccountId = accountId;

    // Al cambiar de cuenta no mostrar los recordatorios de la anterior
    if (listAccountId !== accountId) {
      listAccountId = accountId;
      set({ sharedReminders: [] });
    }

    // La caché propia (AsyncStorage) se usa mientras no haya datos fiables de Firestore:
    // un snapshot del servidor o uno de caché con contenido. Así no pisa datos más nuevos.
    let hasReliableData = false;
    AsyncStorage.getItem(sharedCacheKey(accountId)).then((raw) => {
      if (raw && !hasReliableData && subscribedAccountId === accountId) {
        set({ sharedReminders: JSON.parse(raw) });
      }
    }).catch(() => {});

    const unsubscribe = getSharedRemindersCol(accountId).onSnapshot(
      { includeMetadataChanges: true },
      (snap) => {
        if (subscribedAccountId !== accountId) return;
        const list = snap.docs.map(d => ({ ...(d.data() as Reminder), id: d.id }));
        const fromCache = snap.metadata.fromCache;
        // Arranque sin conexión con la caché de Firestore vacía: no vaciar la lista
        // (se mantiene la caché propia) hasta tener datos fiables
        if (fromCache && list.length === 0 && !hasReliableData) return;
        hasReliableData = true;
        list.forEach(r => pendingIds.delete(r.id));
        set({ sharedReminders: list });
        AsyncStorage.setItem(sharedCacheKey(accountId), JSON.stringify(list)).catch(() => {});
        // Un snapshot de caché puede venir incompleto (sin conexión): no cancelar nada con él
        syncSharedNotifications(list, getSharedAccountState().sharedAccount?.name, !fromCache);
      },
      (e) => {
        console.error('Error listening to shared reminders:', e);
        // Firestore cierra el listener tras un error: permitir volver a suscribirse
        // (al volver a la app o al abrir la pantalla de recordatorios)
        if (sharedUnsubscribe === unsubscribe) {
          sharedUnsubscribe = null;
          subscribedAccountId = null;
        }
      },
    );
    sharedUnsubscribe = unsubscribe;
  },

  unsubscribeSharedReminders: (cancelNotifications) => {
    if (sharedUnsubscribe) { sharedUnsubscribe(); sharedUnsubscribe = null; }
    const accountId = subscribedAccountId;
    subscribedAccountId = null;
    listAccountId = null;
    pendingIds.clear();
    set({ sharedReminders: [] });

    if (cancelNotifications) {
      runExclusive(async () => {
        const map = await readNotifMap();
        for (const entry of Object.values(map)) {
          await cancelNotification(entry.n);
        }
        await AsyncStorage.removeItem(SHARED_NOTIF_MAP_KEY);
        if (accountId) await AsyncStorage.removeItem(sharedCacheKey(accountId));
      });
    }
  },

  // Programa las notificaciones compartidas que falten (p. ej. tras conceder el permiso).
  // No cancela nada: la lista puede venir de caché.
  resyncSharedNotifications: () => {
    if (!subscribedAccountId) return;
    syncSharedNotifications(get().sharedReminders, getSharedAccountState().sharedAccount?.name, false);
  },

  // Cancela también el listener de recordatorios compartidos y limpia la lista.
  // Sin esto, un reset que no pasara por unsubscribeAll() (borrar la cuenta)
  // dejaba el listener vivo y los recordatorios del usuario anterior en memoria.
  // Llamarlo dos veces es inofensivo: unsubscribeSharedReminders es idempotente.
  resetStore: () => {
    get().unsubscribeSharedReminders(true);
    set({ reminders: [] });
  },
}));
