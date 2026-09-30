import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../i18n';

// Canal Android para notificaciones locales y push (la Cloud Function envía con channelId 'default').
// En Android 8+ una notificación sin canal válido no se muestra.
export const ANDROID_CHANNEL_ID = 'default';

// Identificador fijo de la notificación diaria: permite cancelarla sin tocar los recordatorios
const DAILY_NOTIFICATION_ID = 'moflo_daily_notification';
const DAILY_NOTIFICATION_TITLE = '💰 MoFlo';
// La misma clave que usa Ajustes para saber si la diaria está activada
const DAILY_ENABLED_KEY = '@moflo_daily_notif';
// Idioma del texto con el que se programó la diaria
const DAILY_LANGUAGE_KEY = '@moflo_daily_notif_language';
// Hora elegida para la diaria, "H:M"
const DAILY_TIME_KEY = '@moflo_daily_notif_time';

export type DailyTime = { hour: number; minute: number };
// La de siempre, para quien la activó antes de poder elegir la hora
const DEFAULT_DAILY_TIME: DailyTime = { hour: 20, minute: 0 };

export const getDailyNotificationTime = async (): Promise<DailyTime> => {
  try {
    const saved = await AsyncStorage.getItem(DAILY_TIME_KEY);
    const [hour, minute] = (saved ?? '').split(':').map(Number);
    if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) return { hour, minute };
  } catch {}
  return DEFAULT_DAILY_TIME;
};

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

// Programa (o reprograma) la notificación diaria. Con time se programa a esa
// hora y se guarda; sin él, a la guardada (las 20:00 si no se eligió ninguna)
export const scheduleDailyNotification = async (body: string, time?: DailyTime): Promise<void> => {
  if (time) await AsyncStorage.setItem(DAILY_TIME_KEY, `${time.hour}:${time.minute}`).catch(() => {});
  const { hour, minute } = time ?? await getDailyNotificationTime();
  await ensureNotificationChannel();
  await cancelDailyNotification();
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_NOTIFICATION_ID,
    content: { title: DAILY_NOTIFICATION_TITLE, body, sound: true },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: ANDROID_CHANNEL_ID,
    },
  });
  await AsyncStorage.setItem(DAILY_LANGUAGE_KEY, i18n.language).catch(() => {});
};

/**
 * La notificación diaria se programa con el texto del idioma de ese momento y
 * se quedaba así aunque después se cambiara el idioma de la app. Si está
 * activada y se programó en otro idioma, se vuelve a programar con el actual.
 * Si no ha cambiado no hace nada, así que se puede llamar en cada arranque.
 */
export const refreshDailyNotificationLanguage = async (): Promise<void> => {
  try {
    if ((await AsyncStorage.getItem(DAILY_ENABLED_KEY)) !== 'true') return;
    if ((await AsyncStorage.getItem(DAILY_LANGUAGE_KEY)) === i18n.language) return;
    await scheduleDailyNotification(i18n.t('settings.notifMovementsSubtitle'));
  } catch (e) {
    console.warn('Failed to refresh daily notification language', e);
  }
};
