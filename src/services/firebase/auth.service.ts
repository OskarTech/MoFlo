import auth from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
export { signInWithApple } from './appleAuth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useMovementStore } from '../../store/movementStore';
import { useSettingsStore } from '../../store/settingsStore';
import { usePremiumStore } from '../../store/premiumStore';
import { useCategoryStore } from '../../store/categoryStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { useSharedCategoryStore } from '../../store/sharedCategoryStore';
import { useSavingsStore } from '../../store/savingsStore';
import { useReminderStore } from '../../store/reminderStore';
import { clearPushTokens } from './pushTokens.service';
import { processQueue } from '../syncQueue.service';
import { resetPurchasesUser } from '../revenuecat';

GoogleSignin.configure({
  webClientId: '376703221466-iovth1ic0v85o741s0k6sms9141h35fn.apps.googleusercontent.com',
});

export const registerWithEmail = async (
  email: string,
  password: string
) => {
  const userCredential = await auth().createUserWithEmailAndPassword(email, password);
  return userCredential.user;
};

export const loginWithEmail = async (
  email: string,
  password: string
) => {
  const userCredential = await auth().signInWithEmailAndPassword(email, password);
  return userCredential.user;
};

export const loginWithGoogle = async () => {
  await GoogleSignin.hasPlayServices();
  const signInResult = await GoogleSignin.signIn();
  const idToken = signInResult.data?.idToken;
  if (!idToken) throw new Error('No se obtuvo el token de Google');
  const googleCredential = auth.GoogleAuthProvider.credential(idToken);
  const userCredential = await auth().signInWithCredential(googleCredential);
  return userCredential.user;
};


export const logout = async () => {
  const uid = auth().currentUser?.uid;

  // 0.a Soltar el usuario de RevenueCat no depende de Firebase, así que se
  // lanza ya y se espera más abajo: encadenar sus dos topes de tiempo sumaba
  // hasta 8 segundos en el peor caso. En paralelo, el peor caso son 5.
  const purchasesReset = resetPurchasesUser().catch(() => {});

  // 0.b Sube lo que quede pendiente ANTES de cerrar sesión. Con un tope de tiempo
  // para que el botón no se quede colgado si la conexión es mala: lo que no
  // suba se queda en la cola marcado con este uid y se sincroniza solo cuando
  // este usuario vuelva a entrar. Antes la cola se borraba aquí sin más y esos
  // movimientos se perdían para siempre.
  try {
    const flushTimeout = new Promise<void>((resolve) => setTimeout(resolve, 5000));
    await Promise.race([processQueue().catch(() => {}), flushTimeout]);
  } catch {}

  // 1. Borra el token FCM de este dispositivo en Firestore para no recibir más pushes
  if (uid) {
    try { await clearPushTokens(uid); } catch {}
  }

  // 2. Cancela listeners PRIMERO antes de todo
  useSharedAccountStore.getState().unsubscribeAll();
  useSharedCategoryStore.getState().resetSharedCategories();

  // 3. Resetea todos los stores
  useMovementStore.getState().resetStore();
  useSettingsStore.getState().resetStore();
  usePremiumStore.getState().setPremium(false);
  useCategoryStore.getState().resetStore();
  useSharedAccountStore.getState().resetStore();
  useSavingsStore.getState().resetStore();
  useReminderStore.getState().resetStore();

  // 3.b Suelta también el usuario de RevenueCat. Sin esto el SDK se queda con
  // el App User ID del anterior, y quien entre después en este móvil hereda su
  // identidad de compra. Se lanzó al principio; aquí solo se espera.
  await purchasesReset;

  // 4. Cancela todas las notificaciones programadas en iOS/Android (recordatorio diario + reminders)
  try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch {}

  // 5. Limpia AsyncStorage.
  // '@moflo_sync_queue' ya NO se borra aquí: cada operación lleva su uid, así
  // que lo que no se haya podido subir espera a que ese usuario vuelva a entrar
  // en vez de perderse.
  const keysToRemove = [
    '@moflo_movements',
    '@moflo_recurring',
    '@moflo_settings',
    '@moflo_premium',
    '@moflo_custom_categories',
    '@moflo_shared_account',
    '@moflo_active_account',
    '@moflo_shared_movements',
    '@moflo_shared_recurring',
    '@moflo_huchas',
    '@moflo_shared_huchas',
    // Caché de los movimientos de huchas: sin borrarla, al entrar otra persona
    // en el mismo móvil se le enseñaban un instante los movimientos del anterior
    '@moflo_hucha_movements',
    '@moflo_shared_hucha_movements',
    '@moflo_daily_notif',
  ];

  // '@moflo_reminders_{uid}' tampoco se borra: los recordatorios personales solo
  // viven en este móvil y borrarlos aquí los perdía para siempre. La clave ya es
  // de este usuario, así que nadie más los ve. Sus notificaciones sí se cancelan
  // arriba y se vuelven a programar cuando vuelve a entrar.
  if (uid) {
    keysToRemove.push(
      `@moflo_hidden_base_${uid}`,
      `@moflo_shared_notif_${uid}`,
    );
  }

  await AsyncStorage.multiRemove(keysToRemove);

  // 6. Cierra sesión en Firebase
  await auth().signOut();
};