import auth, { firebase } from '@react-native-firebase/auth';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMovementStore } from '../../store/movementStore';
import { useSettingsStore } from '../../store/settingsStore';
import { usePremiumStore } from '../../store/premiumStore';
import { useCategoryStore } from '../../store/categoryStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { useSharedCategoryStore } from '../../store/sharedCategoryStore';
import { useSavingsStore } from '../../store/savingsStore';

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

export const signInWithApple = async (): Promise<boolean> => {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    const { identityToken, fullName } = credential;
    if (!identityToken) throw new Error('No identity token');

    const appleCredential = firebase.auth.OAuthProvider.credential('apple.com', identityToken);
    const userCredential = await auth().signInWithCredential(appleCredential);

    if (fullName?.givenName && userCredential.additionalUserInfo?.isNewUser) {
      const displayName = [fullName.givenName, fullName.familyName]
        .filter(Boolean).join(' ');
      await userCredential.user.updateProfile({ displayName });
    }

    return true;
  } catch (e: any) {
    if (e.code === 'ERR_REQUEST_CANCELED') return false;
    console.error('Apple Sign In error:', e);
    throw e;
  }
};

export const logout = async () => {
  const uid = auth().currentUser?.uid;

  // 1. Cancela listeners PRIMERO antes de todo
  useSharedAccountStore.getState().unsubscribeAll();
  useSharedCategoryStore.getState().resetSharedCategories();

  // 2. Resetea todos los stores
  useMovementStore.getState().resetStore();
  useSettingsStore.getState().resetStore();
  usePremiumStore.getState().setPremium(false);
  useCategoryStore.getState().resetStore();
  useSharedAccountStore.getState().resetStore();
  useSavingsStore.getState().resetStore();

  // 3. Limpia AsyncStorage
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
    '@moflo_huchas',
    '@moflo_shared_huchas',
  ];

  if (uid) {
    keysToRemove.push(
      `@moflo_hidden_base_${uid}`,
      `@moflo_reminders_${uid}`,
      `@moflo_shared_notif_${uid}`,
    );
  }

  await AsyncStorage.multiRemove(keysToRemove);

  // 4. Cierra sesión en Firebase
  await auth().signOut();
};