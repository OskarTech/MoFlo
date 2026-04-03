import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme';
import AppHeader from '../../components/common/AppHeader';
import { useSettingsStore } from '../../store/settingsStore';
import emailjs from '@emailjs/browser';
import Constants from 'expo-constants';

const EMAILJS_SERVICE_ID = 'service_2vvr2ea';
const EMAILJS_TEMPLATE_ID = 'template_3upiouj';
const EMAILJS_PUBLIC_KEY = 'bHJges8U4t2BLb61h';

const SupportScreen = () => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const { displayName } = useSettingsStore();

  const [name, setName] = useState(displayName ?? '');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const isValid = !!name.trim() && !!email.trim() && !!message.trim();

  const handleSend = async () => {
    if (!isValid) return;
    setSending(true);
    try {
      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        {
          name: name.trim(),
          email: email.trim(),
          title: subject.trim() || t('settings.supportSubjectPlaceholder'),
          message: message.trim(),
          app_version: appVersion,
        },
        EMAILJS_PUBLIC_KEY
      );

      Alert.alert(
        t('settings.supportSuccess'),
        t('settings.supportSuccessMessage'),
        [{ text: 'OK', onPress: () => {
          setSubject('');
          setMessage('');
        }}]
      );
    } catch (e) {
      Alert.alert(
        t('settings.supportError'),
        t('settings.supportErrorMessage')
      );
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
        {/* INFO */}
        <View style={[styles.infoCard, {
          backgroundColor: colors.primary + '15',
          borderColor: colors.primary + '30',
        }]}>
          <Text style={[styles.infoText, { color: colors.primary }]}>
            💬 {t('settings.supportInfo')}
          </Text>
        </View>

        {/* FORMULARIO */}
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
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          mode="outlined"
          style={[styles.input, { backgroundColor: dc.surface }]}
          outlineColor={dc.border}
          activeOutlineColor={colors.primary}
        />

        <TextInput
          label={t('settings.supportSubjectPlaceholder')}
          value={subject}
          onChangeText={setSubject}
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
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
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
  input: {
    marginBottom: 12,
  },
  messageInput: {
    minHeight: 120,
  },
  button: {
    borderRadius: 12,
    marginTop: 8,
  },
  buttonContent: {
    height: 52,
  },
});

export default SupportScreen;