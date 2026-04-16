import auth from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMovementStore } from '../../store/movementStore';
import { useSettingsStore } from '../../store/settingsStore';
import { usePremiumStore } from '../../store/premiumStore';
import { useCategoryStore } from '../../store/categoryStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';

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

  // 1. Resetea todos los stores en memoria
  useMovementStore.getState().resetStore();
  useSettingsStore.getState().resetStore();
  usePremiumStore.getState().setPremium(false);
  useCategoryStore.getState().resetStore();
  useSharedAccountStore.getState().resetStore();

  // 2. Limpia AsyncStorage — individual
  const keysToRemove = [
    '@moflo_movements',
    '@moflo_recurring',
    '@moflo_settings',
    '@moflo_sync_queue',
    '@moflo_premium',
    '@moflo_custom_categories',
    '@moflo_shared_account',
    '@moflo_active_account',
    '@moflo_shared_movements',
    '@moflo_shared_recurring',
  ];

  // Claves con uid
  if (uid) {
    keysToRemove.push(
      `@moflo_hidden_base_${uid}`,
      `@moflo_reminders_${uid}`,
      `@moflo_shared_notif_${uid}`,
    );
  }

  await AsyncStorage.multiRemove(keysToRemove);

  // 3. Cierra sesión en Firebase
  await auth().signOut();
};