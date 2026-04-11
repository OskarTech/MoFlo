import React, { useState } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../types/navigation.types';
import auth from '@react-native-firebase/auth';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'>;
};

const ForgotPasswordScreen = ({ navigation }: Props) => {
  const { t } = useTranslation();
  const { isDark, colors: dc } = useTheme();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const inputBg = isDark ? colors.surfaceDark : '#FFFFFF';

  const handleSend = async () => {
    if (!email.trim()) return;
    setLoading(true);
    try {
      await auth().sendPasswordResetEmail(email.trim());
      setSent(true);
    } catch (e: any) {
      Alert.alert(
        'Error',
        e.code === 'auth/user-not-found'
          ? t('auth.errorUserNotFound')
          : t('auth.errorGeneral')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 16 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* BACK */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={dc.textPrimary} />
        </TouchableOpacity>

        {/* HEADER */}
        <View style={styles.header}>
          <View style={[styles.iconContainer, {
            backgroundColor: colors.primary + '20',
          }]}>
            <Ionicons name="lock-open-outline" size={48} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: dc.textPrimary }]}>
            {t('auth.forgotPassword')}
          </Text>
          <Text style={[styles.subtitle, { color: dc.textSecondary }]}>
            {t('auth.forgotPasswordSubtitle')}
          </Text>
        </View>

        {!sent ? (
          <>
            <TextInput
              label={t('auth.email')}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              mode="outlined"
              style={[styles.input, { backgroundColor: inputBg }]}
              outlineColor={dc.border}
              activeOutlineColor={colors.primary}
            />

            <Button
              mode="contained"
              onPress={handleSend}
              loading={loading}
              disabled={!email.trim() || loading}
              style={styles.button}
              contentStyle={styles.buttonContent}
              buttonColor={colors.primary}
              textColor="#FFFFFF"
            >
              {t('auth.sendResetEmail')}
            </Button>
          </>
        ) : (
          <View style={[styles.successCard, {
            backgroundColor: colors.primary + '15',
            borderColor: colors.primary + '30',
          }]}>
            <Ionicons name="checkmark-circle" size={56} color={colors.primary} />
            <Text style={[styles.successText, { color: dc.textPrimary }]}>
              {t('auth.resetEmailSent')}
            </Text>
            <Text style={[styles.successSubtext, { color: dc.textSecondary }]}>
              {t('auth.resetEmailSentSubtitle')}
            </Text>
            <Button
              mode="contained"
              onPress={() => navigation.goBack()}
              style={[styles.button, { marginTop: 16 }]}
              contentStyle={styles.buttonContent}
              buttonColor={colors.primary}
              textColor="#FFFFFF"
            >
              {t('auth.backToLogin')}
            </Button>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
  },
  backButton: {
    marginBottom: 24,
    alignSelf: 'flex-start',
    padding: 4,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconContainer: {
    width: 96, height: 96, borderRadius: 48,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontFamily: 'Poppins_700Bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
  input: { marginBottom: 16 },
  button: { borderRadius: 12 },
  buttonContent: { height: 52 },
  successCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 0.5,
  },
  successText: {
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  successSubtext: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default ForgotPasswordScreen;