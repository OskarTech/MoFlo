import auth from '@react-native-firebase/auth';
import * as AppleAuthentication from 'expo-apple-authentication';

/**
 * Vuelve a verificar al dueño de la sesión actual sin cambiar de cuenta.
 * Firebase exige un inicio de sesión reciente para borrar la cuenta.
 * Devuelve false si el usuario cancela la hoja de Apple; lanza si falla de verdad.
 */
export const reauthenticateWithApple = async (): Promise<boolean> => {
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
    return true;
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED') return false;
    throw e;
  }
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
