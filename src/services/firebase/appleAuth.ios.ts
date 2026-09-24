import auth from '@react-native-firebase/auth';
import * as AppleAuthentication from 'expo-apple-authentication';

// Código de autorización de la última reautenticación con Apple. Es de un solo
// uso y caduca a los pocos minutos: solo sirve para revocar el token justo
// después, al borrar la cuenta.
let lastAuthorizationCode: string | null = null;

/**
 * Vuelve a verificar al dueño de la sesión actual sin cambiar de cuenta.
 * Firebase exige un inicio de sesión reciente para borrar la cuenta.
 * Devuelve false si el usuario cancela la hoja de Apple; lanza si falla de verdad.
 */
export const reauthenticateWithApple = async (): Promise<boolean> => {
  lastAuthorizationCode = null;
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
    const { identityToken } = credential;
    if (!identityToken) return false;

    const user = auth().currentUser;
    if (!user) return false;

    const appleCredential = auth.AppleAuthProvider.credential(identityToken);
    await user.reauthenticateWithCredential(appleCredential);
    lastAuthorizationCode = credential.authorizationCode ?? null;
    return true;
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED') return false;
    throw e;
  }
};

/**
 * Revoca el token de Sign in with Apple, como exige Apple al borrar la cuenta.
 * Usa el código de la reautenticación previa y tiene que llamarse con la sesión
 * todavía abierta: Firebase lo asocia al usuario actual. Sin código (la cuenta
 * no es de Apple) no hace nada.
 */
export const revokeAppleToken = async (): Promise<void> => {
  const code = lastAuthorizationCode;
  lastAuthorizationCode = null;
  if (!code) return;
  await auth().revokeToken(code);
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

    const appleCredential = auth.AppleAuthProvider.credential(identityToken);
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
