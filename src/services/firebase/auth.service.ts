import auth from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMovementStore } from '../../store/movementStore';
import { useSettingsStore } from '../../store/settingsStore';

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
  // 1. Resetea los stores en memoria
  useMovementStore.getState().resetStore();
  useSettingsStore.getState().resetStore();

  // 2. Limpia AsyncStorage
  await AsyncStorage.multiRemove([
    '@moflo_movements',
    '@moflo_recurring',
    '@moflo_settings',
    '@moflo_sync_queue',
  ]);

  // 3. Cierra sesión en Firebase
  await auth().signOut();
};