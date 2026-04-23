import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Text, TextInput, Button } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../types/navigation.types';
import { loginWithEmail, loginWithGoogle, signInWithApple } from '../../services/firebase/auth.service';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>;
};

const LoginScreen = ({ navigation }: Props) => {
  const { t } = useTranslation();
  const { isDark, colors: dc } = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);
  const [error, setError] = useState('');

  const inputBg = isDark ? colors.surfaceDark : '#FFFFFF';

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
    setIsAppleLoading(true);
    try {
      await signInWithApple();
    } catch (e) {
      Alert.alert('Error', t('auth.appleSignInError'));
    } finally {
      setIsAppleLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
    } catch (e: any) {
      setError(t('auth.errorGeneral'));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <KeyboardAvoidingView
        // En iOS usamos padding, en Android el sistema suele manejarlo mejor con 'height' o nada
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        // Si tienes una cabecera de Stack activa, este offset suele ser de unos 60-80
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* LOGO */}
          <View style={styles.header}>
            <Image
              source={require('../../../assets/icon.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={[styles.appName, { color: dc.textPrimary }]}>MoFlo</Text>
            <Text style={[styles.subtitle, { color: dc.textSecondary }]}>
              {t('auth.subtitle')}
            </Text>
          </View>

          {/* FORMULARIO */}
          <View style={styles.form}>
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

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={styles.forgotPassword}
              onPress={() => navigation.navigate('ForgotPassword')}
            >
              <Text style={[styles.forgotText, { color: colors.primary }]}>
                {t('auth.forgotPassword')}
              </Text>
            </TouchableOpacity>

            <Button
              mode="contained"
              onPress={handleLogin}
              loading={loading}
              disabled={loading}
              style={styles.button}
              contentStyle={styles.buttonContent}
              buttonColor={colors.primary}
              textColor="#FFFFFF"
            >
              {t('auth.login')}
            </Button>

            <View style={styles.divider}>
              <View style={[styles.dividerLine, { backgroundColor: dc.border }]} />
              <Text style={[styles.dividerText, { color: dc.textSecondary }]}>o</Text>
              <View style={[styles.dividerLine, { backgroundColor: dc.border }]} />
            </View>

            <Button
              mode="outlined"
              onPress={handleGoogleLogin}
              loading={googleLoading}
              disabled={googleLoading}
              style={[styles.googleButton, { borderColor: dc.border }]}
              contentStyle={styles.buttonContent}
              icon="google"
              textColor={dc.textPrimary}
            >
              {t('auth.googleLogin')}
            </Button>

            {Platform.OS === 'ios' && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={isDark
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={12}
                style={styles.appleButton}
                onPress={handleAppleSignIn}
              />
            )}

            <View style={styles.registerLink}>
              <Text style={[styles.linkText, { color: dc.textSecondary }]}>
                {t('auth.noAccount')}{' '}
              </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                <Text style={[styles.linkAction, { color: colors.primary }]}>
                  {t('auth.register')}
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
    paddingBottom: 40 // Espacio extra inferior para que el último elemento no pegue al teclado
  },
  header: { alignItems: 'center', marginBottom: 40 },
  logoImage: {
    width: 120,
    height: 120,
    borderRadius: 28,
    marginBottom: 16,
  },
  appName: { fontSize: 32, fontFamily: 'Poppins_700Bold', letterSpacing: 1, marginBottom: 4 },
  subtitle: { fontSize: 14, fontFamily: 'Poppins_400Regular' },
  form: { gap: 8 },
  input: { marginBottom: 4 },
  errorText: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: colors.expense, marginBottom: 4 },
  forgotPassword: { alignSelf: 'flex-end', marginBottom: 8 },
  forgotText: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
  button: { borderRadius: 12, marginTop: 4 },
  buttonContent: { height: 52 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 16 },
  dividerLine: { flex: 1, height: 0.5 },
  dividerText: { marginHorizontal: 12, fontSize: 13, fontFamily: 'Poppins_400Regular' },
  googleButton: { borderRadius: 12 },
  appleButton: { width: '100%', height: 50, marginTop: 12 },
  registerLink: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  linkText: { fontSize: 14, fontFamily: 'Poppins_400Regular' },
  linkAction: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
});

export default LoginScreen;