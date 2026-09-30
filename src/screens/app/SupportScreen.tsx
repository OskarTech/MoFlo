import React, { useRef, useState } from 'react';
import { View, StyleSheet, Alert, Platform, ScrollView } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from '../../components/common/Icon';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';
import { useTheme } from '../../hooks/useTheme';
import { HeroScrollScreen } from '../../components/layout/HeroScreen';
import { HeroTitleBar } from '../../components/layout/HeroBar';
import { SheetButton, FilledInput, SheetLabel } from '../../components/common/BottomSheet';
import { useSettingsStore } from '../../store/settingsStore';
import auth from '@react-native-firebase/auth';

// Versión, build y sistema del usuario, p. ej. "MoFlo 1.4.8 (48) · iOS 18.2".
// Va al final del mensaje y no en un campo aparte: así sale en el correo sin
// tener que tocar la plantilla de EmailJS.
const getAppInfo = () => {
  const version = Constants.expoConfig?.version ?? '?';
  const build = Platform.OS === 'ios'
    ? Constants.expoConfig?.ios?.buildNumber
    : Constants.expoConfig?.android?.versionCode;
  const os = Platform.OS === 'ios'
    ? `iOS ${Platform.Version}`
    : Platform.OS === 'android'
      ? `Android ${Platform.constants.Release} (API ${Platform.Version})`
      : Platform.OS;
  return `MoFlo ${version}${build ? ` (${build})` : ''} · ${os}`;
};

const SupportScreen = () => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const navigation = useNavigation();
  const { displayName } = useSettingsStore();
  const user = auth().currentUser;

  const userEmail = user?.email ?? '';
  const userName = displayName || user?.displayName || '';

  const [name, setName] = useState(userName);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const isValid = !!name.trim() && !!message.trim();

  // Con el teclado abierto, el final del mensaje y el botón de enviar se traen
  // a la vista: al entrar en el campo y cada vez que el mensaje crece. Antes
  // el teclado tapaba medio campo y el botón, y la pantalla no se podía mover
  const scrollRef = useRef<ScrollView>(null);
  const messageFocused = useRef(false);
  const showMessageEnd = () => scrollRef.current?.scrollToEnd({ animated: true });

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
          message: `${message.trim()}\n\n—\n${getAppInfo()}`,
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
    } catch {
      Alert.alert(t('settings.supportError'), t('settings.supportErrorMessage'));
    } finally {
      setSending(false);
    }
  };

  const hero = (
    <>
      <HeroTitleBar title={t('settings.supportTitle')} onBack={() => navigation.goBack()} />
      <Text style={[styles.heroText, { color: ui.onHeroSoft }]}>{t('settings.supportInfo')}</Text>
    </>
  );

  return (
    <HeroScrollScreen
      hero={hero}
      scrollRef={scrollRef}
      keyboardShouldPersistTaps="handled"
      // iOS: deja debajo el hueco del teclado, para poder desplazar hasta el final
      automaticallyAdjustKeyboardInsets
      sheetStyle={styles.sheet}
    >
      {/* Email del usuario: solo informativo */}
      <View style={[styles.emailInfo, { backgroundColor: ui.field }]}>
        <Icon name="mail-outline" size={18} color={dc.textSecondary} />
        <View style={styles.emailText}>
          <Text style={[styles.emailInfoLabel, { color: dc.textSecondary }]}>{t('auth.email')}</Text>
          <Text style={[styles.emailInfoValue, { color: dc.textPrimary }]} numberOfLines={1}>{userEmail}</Text>
        </View>
      </View>

      <SheetLabel>{t('auth.name')}</SheetLabel>
      <FilledInput icon="person-outline" value={name} onChangeText={setName} />

      <SheetLabel>{t('settings.supportMessagePlaceholder')}</SheetLabel>
      <FilledInput
        value={message}
        onChangeText={setMessage}
        multiline
        style={styles.messageInput}
        onFocus={() => {
          messageFocused.current = true;
          // Cuando el teclado ya ha subido
          setTimeout(showMessageEnd, 350);
        }}
        onBlur={() => { messageFocused.current = false; }}
        onContentSizeChange={() => { if (messageFocused.current) showMessageEnd(); }}
      />

      <SheetButton
        label={t('settings.supportSend')}
        onPress={handleSend}
        loading={sending}
        disabled={!isValid}
        icon="send-outline"
        style={styles.button}
      />
    </HeroScrollScreen>
  );
};

const styles = StyleSheet.create({
  heroText: { fontSize: 13.5, fontFamily: 'Poppins_400Regular', lineHeight: 20, paddingHorizontal: 20, paddingTop: 10 },
  sheet: { paddingHorizontal: 20 },
  emailInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  emailText: { flex: 1, minWidth: 0 },
  emailInfoLabel: { fontSize: 11.5, fontFamily: 'Poppins_400Regular' },
  emailInfoValue: { fontSize: 14, fontFamily: 'Poppins_500Medium' },
  messageInput: { minHeight: 140, textAlignVertical: 'top' },
  button: { marginTop: 20 },
});

export default SupportScreen;
