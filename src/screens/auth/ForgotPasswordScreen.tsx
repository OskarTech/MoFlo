import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../types/navigation.types';
import auth from '@react-native-firebase/auth';
import { useTheme } from '../../hooks/useTheme';
import { FilledInput, SheetButton } from '../../components/common/BottomSheet';
import { HeroTitleBar } from '../../components/layout/HeroBar';
import { AuthScreen } from '../../components/auth/AuthScreen';
import Icon from '../../components/common/Icon';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'>;
};

const ForgotPasswordScreen = ({ navigation }: Props) => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

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
    <AuthScreen
      hero={(
        <>
          <HeroTitleBar title={t('auth.forgotPassword')} onBack={() => navigation.goBack()} />
          <Text style={[styles.heroText, { color: ui.onHeroSoft }]}>{t('auth.forgotPasswordSubtitle')}</Text>
        </>
      )}
    >
      {!sent ? (
        <>
          <FilledInput
            icon="mail-outline"
            value={email}
            onChangeText={setEmail}
            placeholder={t('auth.email')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            onSubmitEditing={handleSend}
          />
          <SheetButton
            label={t('auth.sendResetEmail')}
            onPress={handleSend}
            loading={loading}
            disabled={!email.trim()}
            style={styles.button}
          />
        </>
      ) : (
        <View style={styles.sent}>
          <View style={[styles.sentIcon, { backgroundColor: ui.accentSoft }]}>
            <Icon name="mail-open-outline" size={32} color={ui.accent} />
          </View>
          <Text style={[styles.sentTitle, { color: dc.textPrimary }]}>{t('auth.resetEmailSent')}</Text>
          <Text style={[styles.sentText, { color: dc.textSecondary }]}>{t('auth.resetEmailSentSubtitle')}</Text>
          <SheetButton label={t('auth.backToLogin')} onPress={() => navigation.goBack()} style={styles.sentButton} />
        </View>
      )}
    </AuthScreen>
  );
};

const styles = StyleSheet.create({
  heroText: { fontSize: 14, fontFamily: 'Poppins_400Regular', lineHeight: 21, paddingHorizontal: 20, paddingTop: 10 },
  button: { marginTop: 20 },
  sent: { alignItems: 'center', paddingTop: 8 },
  sentIcon: { width: 68, height: 68, borderRadius: 34, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  sentTitle: { fontSize: 19, fontFamily: 'Poppins_700Bold', textAlign: 'center', marginBottom: 6 },
  sentText: { fontSize: 14, fontFamily: 'Poppins_400Regular', textAlign: 'center', lineHeight: 21 },
  sentButton: { marginTop: 22, alignSelf: 'stretch' },
});

export default ForgotPasswordScreen;
