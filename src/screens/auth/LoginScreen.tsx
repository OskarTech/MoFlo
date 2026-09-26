import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, Alert } from 'react-native';
import AppleSignInButton from '../../components/auth/AppleSignInButton';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../types/navigation.types';
import { loginWithEmail, loginWithGoogle, signInWithApple } from '../../services/firebase/auth.service';
import auth from '@react-native-firebase/auth';
import { useSettingsStore } from '../../store/settingsStore';
import { useTheme } from '../../hooks/useTheme';
import { FilledInput, SheetButton } from '../../components/common/BottomSheet';
import {
  AuthScreen, AuthBrand, PasswordInput, AuthSecondaryButton, AuthDivider, AuthSwitchLink, authStyles,
} from '../../components/auth/AuthScreen';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>;
};

const LoginScreen = ({ navigation }: Props) => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email || !password) return;
    setError('');
    setLoading(true);
    try {
      await loginWithEmail(email, password);
    } catch (e: any) {
      switch (e.code) {
        case 'auth/user-not-found':
        case 'auth/invalid-credential':
          setError(t('auth.errorUserNotFound')); break;
        case 'auth/wrong-password':
          setError(t('auth.errorWrongPassword')); break;
        case 'auth/invalid-email':
          setError(t('auth.errorInvalidEmail')); break;
        case 'auth/too-many-requests':
          setError(t('auth.errorTooManyRequests')); break;
        default:
          setError(t('auth.errorGeneral'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    try {
      const signedIn = await signInWithApple();
      // Apple solo da el nombre la primera vez y signInWithApple lo guarda en la
      // cuenta después de iniciar sesión, cuando los ajustes ya se han cargado.
      // Aquí se recoge para esta sesión; la siguiente carga lo guarda en Firestore.
      if (signedIn) {
        await useSettingsStore.getState().adoptDisplayNameIfMissing(auth().currentUser?.displayName);
      }
    } catch {
      Alert.alert(t('common.error'), t('auth.appleSignInError'));
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
    } catch {
      setError(t('auth.errorGeneral'));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <AuthScreen hero={<AuthBrand subtitle={t('auth.subtitle')} />}>
      <Text style={[styles.title, { color: dc.textPrimary }]}>{t('auth.login')}</Text>

      <FilledInput
        icon="mail-outline"
        value={email}
        onChangeText={setEmail}
        placeholder={t('auth.email')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        containerStyle={authStyles.field}
      />
      <PasswordInput
        value={password}
        onChangeText={setPassword}
        placeholder={t('auth.password')}
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={handleLogin}
      />

      {error ? <Text style={[authStyles.error, styles.error, { color: ui.expenseText }]}>{error}</Text> : null}

      <TouchableOpacity
        style={styles.forgot}
        onPress={() => navigation.navigate('ForgotPassword')}
        hitSlop={8}
      >
        <Text style={[styles.forgotText, { color: ui.accent }]}>{t('auth.forgotPassword')}</Text>
      </TouchableOpacity>

      <SheetButton label={t('auth.login')} onPress={handleLogin} loading={loading} />

      <AuthDivider />

      <AuthSecondaryButton
        label={t('auth.googleLogin')}
        icon="logo-google"
        onPress={handleGoogleLogin}
        loading={googleLoading}
      />
      <AppleSignInButton onPress={handleAppleSignIn} />

      <AuthSwitchLink
        text={t('auth.noAccount')}
        action={t('auth.register')}
        onPress={() => navigation.navigate('Register')}
      />
    </AuthScreen>
  );
};

const styles = StyleSheet.create({
  title: { fontSize: 22, fontFamily: 'Poppins_700Bold', letterSpacing: -0.4, marginBottom: 16 },
  error: { marginTop: 10, marginBottom: 0 },
  forgot: { alignSelf: 'flex-end', paddingVertical: 12 },
  forgotText: { fontSize: 13.5, fontFamily: 'Poppins_600SemiBold' },
});

export default LoginScreen;
