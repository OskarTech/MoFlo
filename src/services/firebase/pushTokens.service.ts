import messaging from '@react-native-firebase/messaging';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, PermissionsAndroid } from 'react-native';

const DEVICE_ID_KEY = '@moflo_device_id';

let tokenRefreshUnsubscribe: (() => void) | null = null;

const getOrCreateDeviceId = async (): Promise<string> => {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `${Platform.OS}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
};

const requestPermission = async (): Promise<boolean> => {
  if (Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version >= 33) {
    try {
      const granted = await PermissionsAndroid.request(
        'android.permission.POST_NOTIFICATIONS' as any,
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) return false;
    } catch {
      // continuar
    }
  }
  const status = await messaging().requestPermission();
  return (
    status === messaging.AuthorizationStatus.AUTHORIZED ||
    status === messaging.AuthorizationStatus.PROVISIONAL
  );
};

const saveToken = async (uid: string, deviceId: string, token: string) => {
  await firestore()
    .collection('users').doc(uid)
    .collection('devices').doc(deviceId)
    .set({
      token,
      platform: Platform.OS,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
};

export const setupPushTokens = async (): Promise<void> => {
  const uid = auth().currentUser?.uid;
  if (!uid) return;
  try {
    const granted = await requestPermission();
    if (!granted) return;

    if (Platform.OS === 'ios') {
      try { await messaging().registerDeviceForRemoteMessages(); } catch {}
    }

    const deviceId = await getOrCreateDeviceId();
    const token = await messaging().getToken();
    if (token) await saveToken(uid, deviceId, token);

    if (tokenRefreshUnsubscribe) tokenRefreshUnsubscribe();
    tokenRefreshUnsubscribe = messaging().onTokenRefresh(async (newToken) => {
      const currentUid = auth().currentUser?.uid;
      if (!currentUid || !newToken) return;
      try { await saveToken(currentUid, deviceId, newToken); } catch (e) {
        console.warn('Failed to save refreshed FCM token', e);
      }
    });
  } catch (e) {
    console.warn('Push tokens setup failed', e);
  }
};

export const clearPushTokens = async (uid: string): Promise<void> => {
  if (tokenRefreshUnsubscribe) {
    tokenRefreshUnsubscribe();
    tokenRefreshUnsubscribe = null;
  }
  try {
    const deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (deviceId) {
      await firestore()
        .collection('users').doc(uid)
        .collection('devices').doc(deviceId)
        .delete();
    }
    try { await messaging().deleteToken(); } catch {}
  } catch (e) {
    console.warn('Push tokens cleanup failed', e);
  }
};
