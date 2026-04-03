import React, { useState, useEffect } from 'react';
import {
  View, StyleSheet, ScrollView,
  TouchableOpacity, Alert, Linking,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as LocalAuthentication from 'expo-local-authentication';
import * as StoreReview from 'expo-store-review';
import * as Sharing from 'expo-sharing';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme';
import AppHeader from '../../components/common/AppHeader';
import { logout } from '../../services/firebase/auth.service';
import { usePinStore } from '../../store/pinStore';
import Constants from 'expo-constants';

const OptionRow = ({
  icon, iconColor, label, subtitle, onPress,
  dangerous, value, showArrow = true,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string; label: string;
  subtitle?: string; onPress?: () => void;
  dangerous?: boolean; value?: string;
  showArrow?: boolean;
}) => {
  const { colors: dc } = useTheme();
  return (
    <TouchableOpacity
      style={styles.optionRow}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={[styles.optionIcon, { backgroundColor: iconColor + '20' }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View style={styles.optionContent}>
        <Text style={[
          styles.optionLabel,
          { color: dangerous ? colors.expense : dc.textPrimary },
        ]}>
          {label}
        </Text>
        {subtitle && (
          <Text style={[styles.optionSubtitle, { color: dc.textSecondary }]}>
            {subtitle}
          </Text>
        )}
      </View>
      {value && (
        <Text style={[styles.optionValue, { color: dc.textSecondary }]}>{value}</Text>
      )}
      {showArrow && onPress && (
        <Ionicons name="chevron-forward" size={18} color={dc.textSecondary} />
      )}
    </TouchableOpacity>
  );
};

const SettingsScreen = () => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { pin, removePin, biometricsEnabled, setBiometrics, loadPin } = usePinStore();
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  useEffect(() => {
    checkBiometrics();
    loadPin();
  }, []);

  const checkBiometrics = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    setBiometricsAvailable(compatible && enrolled);
  };

  const handleBiometrics = async () => {
    if (!biometricsAvailable) {
      Alert.alert('No disponible', 'Tu dispositivo no tiene biometría configurada.');
      return;
    }
    if (biometricsEnabled) {
      await setBiometrics(false);
      return;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirma tu identidad para activar la biometría',
      fallbackLabel: 'Cancelar',
    });
    if (result.success) {
      await setBiometrics(true);
      Alert.alert('✅', 'Biometría activada correctamente.');
    }
  };

  const handleRemovePin = () => {
    Alert.alert(
      'Eliminar PIN',
      '¿Estás seguro de que quieres eliminar el PIN?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: removePin },
      ]
    );
  };

  const handleRateApp = async () => {
    if (await StoreReview.hasAction()) {
      await StoreReview.requestReview();
    } else {
      Linking.openURL(
        'https://play.google.com/store/apps/details?id=com.oskartech.moflo'
      );
    }
  };

  const handleShare = async () => {
    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(
        'https://play.google.com/store/apps/details?id=com.oskartech.moflo',
        { dialogTitle: '¡Comparte MoFlo con tus amigos!' }
      );
    } else {
      Alert.alert(
        'Compartir',
        'Descarga MoFlo: https://play.google.com/store/apps/details?id=com.oskartech.moflo'
      );
    }
  };

  const handleChangePassword = () => {
    Alert.alert(t('settings.changePassword'), 'Próximamente disponible.');
  };

  const handleLogout = () => {
    Alert.alert(
      t('settings.logout'),
      t('settings.logoutConfirm'),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        { text: t('settings.logout'), style: 'destructive', onPress: logout },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <AppHeader title={t('header.settings_screen')} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* SEGURIDAD */}
        <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
          {t('settings.security')}
        </Text>
        <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
          {!pin ? (
            <OptionRow
              icon="keypad-outline"
              iconColor={colors.primary}
              label={t('settings.pinSetup')}
              subtitle={t('settings.pinSetupSubtitle')}
              onPress={() => navigation.navigate('PinSetup')}
            />
          ) : (
            <>
              <OptionRow
                icon="keypad-outline"
                iconColor={colors.primary}
                label={t('settings.pinChange')}
                subtitle={t('settings.pinChangeSubtitle')}
                onPress={() => navigation.navigate('PinSetup')}
              />
              <View style={[styles.divider, { backgroundColor: dc.border }]} />
              <OptionRow
                icon="close-circle-outline"
                iconColor={colors.expense}
                label={t('settings.pinRemove')}
                subtitle={t('settings.pinRemoveSubtitle')}
                onPress={() => {
                  Alert.alert(
                    t('settings.pinRemove'),
                    t('settings.pinRemoveConfirm'),
                    [
                      { text: t('settings.cancel'), style: 'cancel' },
                      { text: t('settings.pinRemove'), style: 'destructive', onPress: removePin },
                    ]
                  );
                }}
                dangerous
              />
            </>
          )}
        </View>

        {/* APLICACIÓN */}
        <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
          {t('settings.appSection')}
        </Text>
        <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
          <OptionRow
            icon="star-outline"
            iconColor="#F59E0B"
            label={t('settings.rateApp')}
            subtitle={t('settings.rateAppSubtitle')}
            onPress={handleRateApp}
          />
          <View style={[styles.divider, { backgroundColor: dc.border }]} />
          <OptionRow
            icon="share-social-outline"
            iconColor={colors.income}
            label={t('settings.shareApp')}
            subtitle={t('settings.shareAppSubtitle')}
            onPress={handleShare}
          />
          <View style={[styles.divider, { backgroundColor: dc.border }]} />
          <OptionRow
            icon="chatbubble-outline"
            iconColor={colors.primary}
            label={t('settings.support')}
            subtitle={t('settings.supportSubtitle')}
            onPress={() => navigation.navigate('Support')}
          />
        </View>

        {/* CUENTA */}
        <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
          Cuenta
        </Text>
        <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
          <OptionRow
            icon="key-outline"
            iconColor={colors.primary}
            label={t('settings.changePassword')}
            onPress={handleChangePassword}
          />
          <View style={[styles.divider, { backgroundColor: dc.border }]} />
          <OptionRow
            icon="log-out-outline"
            iconColor={colors.expense}
            label={t('settings.logout')}
            onPress={handleLogout}
            dangerous
          />
        </View>

        {/* INFO */}
        <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
          Info
        </Text>
        <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
          <OptionRow
            icon="information-circle-outline"
            iconColor={colors.primary}
            label={t('settings.version')}
            value={`v${appVersion}`}
            showArrow={false}
          />
        </View>

        {/* FOOTER */}
        <Text style={[styles.footer, { color: dc.textSecondary }]}>
          {t('settings.madeWith')}
        </Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  sectionLabel: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    borderRadius: 16,
    marginBottom: 20,
    overflow: 'hidden',
    borderWidth: 0.5,
  },
  divider: { height: 0.5, marginLeft: 68 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  optionContent: { flex: 1 },
  optionLabel: {
    fontSize: 15,
    fontFamily: 'Poppins_500Medium',
  },
  optionSubtitle: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    marginTop: 2,
  },
  optionValue: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    marginRight: 4,
  },
  footer: {
    textAlign: 'center',
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    marginTop: 8,
    marginBottom: 16,
  },
});

export default SettingsScreen;