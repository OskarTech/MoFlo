import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// Canal Android para notificaciones locales y push (la Cloud Function envía con channelId 'default').
// En Android 8+ una notificación sin canal válido no se muestra.
export const ANDROID_CHANNEL_ID = 'default';

// Identificador fijo de la notificación diaria: permite cancelarla sin tocar los recordatorios
const DAILY_NOTIFICATION_ID = 'moflo_daily_notification';
const DAILY_NOTIFICATION_TITLE = '💰 MoFlo';

export const ensureNotificationChannel = async (): Promise<void> => {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'MoFlo',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
  } catch (e) {
    console.warn('Failed to create notification channel', e);
  }
};

// Cancela solo la notificación diaria. También reconoce las creadas antes de usar
// identificador fijo (por su título), en Android (trigger 'daily') e iOS (trigger 'calendar').
export const cancelDailyNotification = async (): Promise<void> => {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter(n => n.identifier === DAILY_NOTIFICATION_ID || n.content.title === DAILY_NOTIFICATION_TITLE)
        .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch (e) {
    console.warn('Failed to cancel daily notification', e);
  }
};

// Programa (o reprograma) la notificación diaria de las 20:00
export const scheduleDailyNotification = async (body: string): Promise<void> => {
  await ensureNotificationChannel();
  await cancelDailyNotification();
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_NOTIFICATION_ID,
    content: { title: DAILY_NOTIFICATION_TITLE, body, sound: true },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 20,
      minute: 0,
      channelId: ANDROID_CHANNEL_ID,
    },
  });
};
