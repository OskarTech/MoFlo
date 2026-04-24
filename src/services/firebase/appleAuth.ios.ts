import auth from '@react-native-firebase/auth';
import * as AppleAuthentication from 'expo-apple-authentication';

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
