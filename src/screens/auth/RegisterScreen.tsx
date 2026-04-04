import React, { useState } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, Image,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../types/navigation.types';
import { registerWithEmail } from '../../services/firebase/auth.service';
import { initializeNewUser } from '../../services/firebase/firestore.service';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Register'>;
};

const RegisterScreen = ({ navigation }: Props) => {
  const { t } = useTranslation();
  const { isDark, colors: dc } = useTheme();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const inputBg = isDark ? colors.surfaceDark : '#FFFFFF';

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
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* HEADER */}
          <View style={styles.header}>
            <Image
              source={require('../../../assets/icon.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={[styles.appName, { color: dc.textPrimary }]}>MoFlo</Text>
          </View>

          {/* FORMULARIO */}
          <View style={styles.form}>
            <Text style={[styles.formTitle, { color: dc.textPrimary }]}>
              {t('auth.register')}
            </Text>

            <TextInput
              label={t('auth.name')}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              mode="outlined"
              style={[styles.input, { backgroundColor: inputBg }]}
              outlineColor={dc.border}
              activeOutlineColor={colors.primary}
            />

            <TextInput
              label={t('auth.email')}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              mode="outlined"
              style={[styles.input, { backgroundColor: inputBg }]}
              outlineColor={dc.border}
              activeOutlineColor={colors.primary}
            />

            <TextInput
              label={t('auth.password')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              mode="outlined"
              style={[styles.input, { backgroundColor: inputBg }]}
              outlineColor={dc.border}
              activeOutlineColor={colors.primary}
              right={
                <TextInput.Icon
                  icon={showPassword ? 'eye-off' : 'eye'}
                  onPress={() => setShowPassword(!showPassword)}
                  color={dc.textSecondary}
                />
              }
            />

            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : null}

            <Button
              mode="contained"
              onPress={handleRegister}
              loading={loading}
              disabled={loading}
              style={styles.button}
              contentStyle={styles.buttonContent}
              buttonColor={colors.primary}
              textColor="#FFFFFF"
            >
              {t('auth.register')}
            </Button>

            <View style={styles.loginLink}>
              <Text style={[styles.linkText, { color: dc.textSecondary }]}>
                {t('auth.hasAccount')}{' '}
              </Text>
              <TouchableOpacity onPress={() => navigation.goBack()}>
                <Text style={[styles.linkAction, { color: colors.primary }]}>
                  {t('auth.login')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoImage: {
    width: 120,
    height: 120,
    borderRadius: 28,
    marginBottom: 16,
  },
  appName: {
    fontSize: 32,
    fontFamily: 'Poppins_700Bold',
    letterSpacing: 1,
  },
  form: { gap: 8 },
  formTitle: {
    fontSize: 22,
    fontFamily: 'Poppins_700Bold',
    marginBottom: 8,
  },
  input: { marginBottom: 4 },
  errorText: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    color: colors.expense,
    marginBottom: 4,
  },
  button: {
    borderRadius: 12,
    marginTop: 8,
  },
  buttonContent: { height: 52 },
  loginLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  linkText: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
  },
  linkAction: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
  },
});

export default RegisterScreen;