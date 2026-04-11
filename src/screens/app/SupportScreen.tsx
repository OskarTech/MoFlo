import React, { useState } from 'react';
import {
  View, StyleSheet, ScrollView, Alert,
} from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme';
import AppHeader from '../../components/common/AppHeader';
import { useSettingsStore } from '../../store/settingsStore';
import Constants from 'expo-constants';
import auth from '@react-native-firebase/auth';

const isValidEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const SupportScreen = () => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const { displayName } = useSettingsStore();
  const user = auth().currentUser;

  const userEmail = user?.email ?? '';
  const userName = displayName || user?.displayName || '';

  const [name, setName] = useState(userName);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const isValid = !!name.trim() && !!message.trim();

  const handleSend = async () => {
    if (!isValid) return;
    setSending(true);
    try {
      const payload = {
        service_id: 'service_2vvr2ea',
        template_id: 'template_3upiouj',
        user_id: 'bHJges8U4t2BLb61h',
        template_params: {
          name: name.trim(),
          email: userEmail,
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

      const responseText = await response.text();

      if (response.ok) {
        Alert.alert(
          t('settings.supportSuccess'),
          t('settings.supportSuccessMessage'),
          [{ text: 'OK', onPress: () => setMessage('') }]
        );
      } else {
        throw new Error(`${response.status}: ${responseText}`);
      }
    } catch (e: any) {
      Alert.alert(t('settings.supportError'), t('settings.supportErrorMessage'));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <AppHeader title={t('settings.supportTitle')} />
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

        {/* Email del usuario — solo informativo */}
        <View style={[styles.emailInfo, {
          backgroundColor: dc.surface,
          borderColor: dc.border,
        }]}>
          <Text style={[styles.emailInfoLabel, { color: dc.textSecondary }]}>
            {t('auth.email')}
          </Text>
          <Text style={[styles.emailInfoValue, { color: dc.textPrimary }]}>
            {userEmail}
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  infoCard: {
    borderRadius: 16, padding: 16,
    marginBottom: 16, borderWidth: 0.5,
  },
  infoText: {
    fontSize: 14, fontFamily: 'Poppins_400Regular', lineHeight: 22,
  },
  emailInfo: {
    borderRadius: 12, padding: 14,
    marginBottom: 12, borderWidth: 0.5,
  },
  emailInfoLabel: {
    fontSize: 11, fontFamily: 'Poppins_400Regular', marginBottom: 2,
  },
  emailInfoValue: {
    fontSize: 14, fontFamily: 'Poppins_500Medium',
  },
  input: { marginBottom: 12 },
  messageInput: { minHeight: 120 },
  button: { borderRadius: 12, marginTop: 8 },
  buttonContent: { height: 52 },
});

export default SupportScreen;