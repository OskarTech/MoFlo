import React, { useState } from 'react';
import {
  View, StyleSheet, ScrollView, Alert,
  KeyboardAvoidingView, Platform, // <--- Añadido
} from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme';
import AppHeader from '../../components/common/AppHeader';
import { useSettingsStore } from '../../store/settingsStore';
import Constants from 'expo-constants';

const EMAILJS_SERVICE_ID = 'service_2vvr2ea';
const EMAILJS_TEMPLATE_ID = 'template_3upiouj';
const EMAILJS_PUBLIC_KEY = 'bHJges8U4t2BLb61h';

const isValidEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const SupportScreen = () => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const { displayName } = useSettingsStore();

  const [name, setName] = useState(displayName ?? '');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const isValid = !!name.trim() && !!email.trim() && !emailError && !!message.trim();

  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (value && !isValidEmail(value)) {
      setEmailError(t('auth.invalidEmail'));
    } else {
      setEmailError('');
    }
  };

  const handleSend = async () => {
    if (!isValid) return;
    if (!isValidEmail(email)) {
      setEmailError(t('auth.invalidEmail'));
      return;
    }
    setSending(true);
    try {
      console.log('Enviando email...');
      const payload = {
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: {
          name: name.trim(),
          email: email.trim(),
          title: 'Soporte MoFlo',
          message: message.trim(),
        },
      };
      
      const response = await fetch(
        'https://api.emailjs.com/api/v1.0/email/send',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'origin': 'http://localhost',
          },
          body: JSON.stringify(payload),
        }
      );

      if (response.ok) {
        Alert.alert(
          t('settings.supportSuccess'),
          t('settings.supportSuccessMessage'),
          [{ text: 'OK', onPress: () => { setMessage(''); setEmail(''); } }]
        );
      } else {
        const responseText = await response.text();
        throw new Error(`${response.status}: ${responseText}`);
      }
    } catch (e: any) {
      console.error('Email error:', e.message);
      Alert.alert(
        t('settings.supportError'),
        e.message
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <AppHeader title={t('settings.supportTitle')} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0} // Compensación para el Header
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={{ backgroundColor: dc.background }}
        >
          <View style={[styles.infoCard, {
            backgroundColor: colors.primary + '15',
            borderColor: colors.primary + '30',
          }]}>
            <Text style={[styles.infoText, { color: colors.primary }]}>
              💬 {t('settings.supportInfo')}
            </Text>
          </View>

          <TextInput
            label={t('auth.name')}
            value={name}
            onChangeText={setName}
            mode="outlined"
            style={[styles.input, { backgroundColor: dc.surface }]}
            outlineColor={dc.border}
            activeOutlineColor={colors.primary}
          />

          <TextInput
            label={t('auth.email')}
            value={email}
            onChangeText={handleEmailChange}
            keyboardType="email-address"
            autoCapitalize="none"
            mode="outlined"
            style={[styles.input, { backgroundColor: dc.surface }]}
            outlineColor={emailError ? colors.expense : dc.border}
            activeOutlineColor={emailError ? colors.expense : colors.primary}
            error={!!emailError}
          />
          {emailError ? (
            <Text style={styles.errorText}>{emailError}</Text>
          ) : null}

          <TextInput
            label={t('settings.supportMessagePlaceholder')}
            value={message}
            onChangeText={setMessage}
            mode="outlined"
            multiline
            numberOfLines={6}
            style={[styles.input, styles.messageInput, { backgroundColor: dc.surface }]}
            outlineColor={dc.border}
            activeOutlineColor={colors.primary}
          />

          <Button
            mode="contained"
            onPress={handleSend}
            loading={sending}
            disabled={!isValid || sending}
            style={styles.button}
            contentStyle={styles.buttonContent}
            buttonColor={colors.primary}
            textColor="#FFFFFF"
          >
            {t('settings.supportSend')}
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  infoCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 0.5,
  },
  infoText: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    lineHeight: 22,
  },
  input: { marginBottom: 12 },
  messageInput: { minHeight: 120 },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    marginTop: -8,
    marginBottom: 12,
    marginLeft: 4,
  },
  button: { borderRadius: 12, marginTop: 8 },
  buttonContent: { height: 52 },
});

export default SupportScreen;