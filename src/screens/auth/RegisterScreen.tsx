import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../types/navigation.types';
import { registerWithEmail } from '../../services/firebase/auth.service';
import { initializeNewUser } from '../../services/firebase/firestore.service';
import { useSettingsStore } from '../../store/settingsStore';
import { useTheme } from '../../hooks/useTheme';
import { FilledInput, SheetButton } from '../../components/common/BottomSheet';
import { HeroTitleBar } from '../../components/layout/HeroBar';
import { AuthScreen, AuthBrand, PasswordInput, AuthSwitchLink, authStyles } from '../../components/auth/AuthScreen';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Register'>;
};

const RegisterScreen = ({ navigation }: Props) => {
  const { t } = useTranslation();
  const { ui } = useTheme();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async () => {
    if (!name || !email || !password) return;
    if (password.length < 6) {
      setError(t('auth.errorWeakPassword'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      await registerWithEmail(email, password);
      await initializeNewUser(name);
      // Los ajustes se cargan en cuanto se crea la sesión, casi siempre antes de
      // que initializeNewUser guarde el nombre: el Home saludaba con "Usuario"
      // hasta el siguiente arranque. Firestore ya lo tiene; aquí solo en local.
      await useSettingsStore.getState().adoptDisplayNameIfMissing(name);
    } catch (e: any) {
      switch (e.code) {
        case 'auth/email-already-in-use':
          setError(t('auth.errorEmailInUse')); break;
        case 'auth/invalid-email':
          setError(t('auth.errorInvalidEmail')); break;
        case 'auth/weak-password':
          setError(t('auth.errorWeakPassword')); break;
        default:
          setError(t('auth.errorGeneral'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen
      hero={(
        <>
          <HeroTitleBar title={t('auth.register')} onBack={() => navigation.goBack()} />
          <AuthBrand subtitle={t('auth.subtitle')} compact />
        </>
      )}
    >
      <FilledInput
        icon="person-outline"
        value={name}
        onChangeText={setName}
        placeholder={t('auth.name')}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        containerStyle={authStyles.field}
      />
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
        autoComplete="new-password"
        textContentType="newPassword"
        onSubmitEditing={handleRegister}
      />

      {error ? <Text style={[authStyles.error, styles.error, { color: ui.expenseText }]}>{error}</Text> : null}

      <SheetButton label={t('auth.register')} onPress={handleRegister} loading={loading} style={styles.button} />

      <AuthSwitchLink
        text={t('auth.hasAccount')}
        action={t('auth.login')}
        onPress={() => navigation.goBack()}
      />
    </AuthScreen>
  );
};

const styles = StyleSheet.create({
  error: { marginTop: 10, marginBottom: 0 },
  button: { marginTop: 20 },
});

export default RegisterScreen;
