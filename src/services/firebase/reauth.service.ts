import auth from '@react-native-firebase/auth';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { reauthenticateWithApple } from './appleAuth';
import { reportError } from '../crashReporting';

/**
 * Reautenticación previa al borrado de cuenta.
 *
 * Firebase rechaza `user.delete()` si la sesión lleva mucho abierta. Antes eso
 * se descubría al final, cuando los datos de Firestore ya estaban borrados: el
 * usuario se quedaba con la cuenta viva y completamente vacía. Y solo se
 * reintentaba con Apple, así que quien entraba con Google o con correo no tenía
 * ninguna salida.
 *
 * Ahora se verifica ANTES de tocar nada. Si falla o se cancela, no se borra.
 */

export type ReauthResult =
  | 'ok'
  | 'needs-password'
  | 'cancelled'
  | 'wrong-password'
  | 'failed';

// Firebase acepta borrar la cuenta si la sesión se inició hace poco. Usamos un
// margen conservador por debajo de ese límite.
const RECENT_LOGIN_MAX_AGE_MS = 4 * 60 * 1000;

const providerIds = (): string[] =>
  auth().currentUser?.providerData?.map((p) => p.providerId) ?? [];

/**
 * Si el único proveedor es correo y contraseña hay que pedírsela al usuario:
 * no hay forma de reautenticar sin ella. Con Apple o Google basta con abrir su
 * hoja de identificación.
 */
export const needsPasswordToReauthenticate = (): boolean => {
  const providers = providerIds();
  if (providers.includes('apple.com') || providers.includes('google.com')) return false;
  return providers.includes('password');
};

export const reauthenticate = async (password?: string): Promise<ReauthResult> => {
  const user = auth().currentUser;
  if (!user) return 'failed';
  const providers = providerIds();

  try {
    if (providers.includes('apple.com')) {
      return (await reauthenticateWithApple()) ? 'ok' : 'cancelled';
    }

    if (providers.includes('google.com')) {
      await GoogleSignin.hasPlayServices();
      const signInResult = await GoogleSignin.signIn();
      const idToken = signInResult.data?.idToken;
      if (!idToken) return 'cancelled';
      const credential = auth.GoogleAuthProvider.credential(idToken);
      await user.reauthenticateWithCredential(credential);
      return 'ok';
    }

    if (providers.includes('password')) {
      if (!password) return 'needs-password';
      if (!user.email) return 'failed';
      const credential = auth.EmailAuthProvider.credential(user.email, password);
      await user.reauthenticateWithCredential(credential);
      return 'ok';
    }

    // Proveedor que no conocemos y no podemos reautenticar a mano. Aquí no vale
    // seguir adelante y confiar: si Firebase exigiera sesión reciente, se
    // enteraría al final, con los datos ya borrados, que es exactamente el
    // fallo que este módulo existe para evitar.
    // Se comprueba cuándo inició sesión de verdad: Firebase solo pide
    // reautenticar cuando esa marca es antigua.
    const tokenResult = await user.getIdTokenResult();
    const authAgeMs = Date.now() - new Date(tokenResult.authTime).getTime();
    return Number.isFinite(authAgeMs) && authAgeMs < RECENT_LOGIN_MAX_AGE_MS
      ? 'ok'
      : 'failed';
  } catch (e: any) {
    const code = e?.code ?? '';

    if (
      code === 'auth/wrong-password'
      || code === 'auth/invalid-credential'
      || code === 'auth/invalid-login-credentials'
    ) return 'wrong-password';

    // Con ?. por si el módulo nativo de Google no estuviera cargado: esto corre
    // dentro de un catch y un fallo aquí se escaparía sin que nadie lo recoja
    if (
      code === statusCodes?.SIGN_IN_CANCELLED
      || code === 'ERR_REQUEST_CANCELED'
      || code === 'auth/user-cancelled'
    ) return 'cancelled';

    reportError(e, 'reauthenticate');
    return 'failed';
  }
};
