import React, { useState, useEffect } from 'react';
import {
  View, StyleSheet, ScrollView,
  TouchableOpacity, Alert, Linking, Share,
  Switch, Modal, FlatList,
} from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as StoreReview from 'expo-store-review';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import { useTheme } from '../../hooks/useTheme';
import { useSettingsStore, CURRENCIES, LANGUAGES, ThemeMode } from '../../store/settingsStore';
import { useMovementStore } from '../../store/movementStore';
import { colors } from '../../theme';
import AppHeader from '../../components/common/AppHeader';
import { logout } from '../../services/firebase/auth.service';
import Constants from 'expo-constants';

const NOTIF_KEY = '@moflo_daily_notif';

const OptionRow = ({
  icon, iconColor, label, subtitle, onPress,
  dangerous, value, showArrow = true, right,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string; label: string;
  subtitle?: string; onPress?: () => void;
  dangerous?: boolean; value?: string;
  showArrow?: boolean; right?: React.ReactNode;
}) => {
  const { colors: dc } = useTheme();
  return (
    <TouchableOpacity
      style={styles.optionRow}
      onPress={onPress}
      disabled={!onPress && !right}
      activeOpacity={right ? 1 : 0.7}
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
      {right ?? (
        <>
          {value && (
            <Text style={[styles.optionValue, { color: dc.textSecondary }]}>{value}</Text>
          )}
          {showArrow && onPress && (
            <Ionicons name="chevron-forward" size={18} color={dc.textSecondary} />
          )}
        </>
      )}
    </TouchableOpacity>
  );
};

const SelectModal = ({
  visible, title, options, selectedValue, onSelect, onDismiss,
}: {
  visible: boolean; title: string;
  options: { code: string; label: string }[];
  selectedValue: string;
  onSelect: (code: string) => void;
  onDismiss: () => void;
}) => {
  const { isDark, colors: dc } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={onDismiss}
        />
        <View style={[styles.modalSheet, {
          backgroundColor: isDark ? colors.surfaceDark : '#FFFFFF',
        }]}>
          <View style={[styles.modalHandle, { backgroundColor: dc.border }]} />
          <Text style={[styles.modalTitle, { color: dc.textPrimary }]}>{title}</Text>
          <FlatList
            data={options}
            keyExtractor={(item) => item.code}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.modalOption, { borderBottomColor: dc.border }]}
                onPress={() => { onSelect(item.code); onDismiss(); }}
              >
                <Text style={[
                  styles.modalOptionText,
                  { color: dc.textPrimary },
                  item.code === selectedValue && {
                    color: colors.primary,
                    fontFamily: 'Poppins_600SemiBold',
                  },
                ]}>
                  {item.label}
                </Text>
                {item.code === selectedValue && (
                  <Ionicons name="checkmark" size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
};

const SettingsScreen = () => {
  const { t } = useTranslation();
  const { colors: dc } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const {
    displayName, currencyCode, language, themeMode, saveSettings,
  } = useSettingsStore();
  const user = auth().currentUser;
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  const [dailyNotifEnabled, setDailyNotifEnabled] = useState(false);
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(displayName ?? '');

  useEffect(() => {
    loadNotifSettings();
    setNameInput(displayName ?? '');
  }, [displayName]);

  const loadNotifSettings = async () => {
    const val = await AsyncStorage.getItem(NOTIF_KEY);
    setDailyNotifEnabled(val === 'true');
  };

  const handleSaveName = async () => {
    if (!nameInput.trim()) return;
    await saveSettings({ displayName: nameInput.trim() });
    setEditingName(false);
  };

  const handleDailyNotif = async (enabled: boolean) => {
    setDailyNotifEnabled(enabled);
    await AsyncStorage.setItem(NOTIF_KEY, String(enabled));

    if (enabled) {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        setDailyNotifEnabled(false);
        await AsyncStorage.setItem(NOTIF_KEY, 'false');
        Alert.alert(
          t('reminders.permissionDenied'),
          t('reminders.permissionDeniedMessage')
        );
        return;
      }
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '💰 MoFlo',
          body: t('settings.notifMovementsSubtitle'),
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: 20,
          minute: 0,
        },
      });
      Alert.alert('✅', 'Recibirás un recordatorio diario a las 20:00h');
    } else {
      await Notifications.cancelAllScheduledNotificationsAsync();
    }
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
    try {
      await Share.share({
        message: '💰 Descarga MoFlo, la app para controlar tus finanzas personales: https://play.google.com/store/apps/details?id=com.oskartech.moflo',
        title: 'MoFlo — Control de finanzas',
      });
    } catch (e) {
      console.error('Share error:', e);
    }
  };

  const handleDeleteData = () => {
    Alert.alert(
      t('settings.deleteData'),
      t('settings.deleteDataConfirm'),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        {
          text: t('settings.deleteDataButton'),
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.multiRemove([
                '@moflo_movements',
                '@moflo_recurring',
              ]);
              useMovementStore.getState().resetStore();
              const uid = auth().currentUser?.uid;
              if (uid) {
                const batch = firestore().batch();
                const movementsSnap = await firestore()
                  .collection('users').doc(uid)
                  .collection('movements').get();
                movementsSnap.docs.forEach((doc) => batch.delete(doc.ref));
                const recurringSnap = await firestore()
                  .collection('users').doc(uid)
                  .collection('recurring').get();
                recurringSnap.docs.forEach((doc) => batch.delete(doc.ref));
                await batch.commit();
              }
              Alert.alert('✅', t('settings.deleteDataSuccess'));
            } catch (e) {
              Alert.alert('Error', 'No se pudieron eliminar los datos.');
            }
          },
        },
      ]
    );
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

  const THEME_OPTIONS: { code: ThemeMode; label: string }[] = [
    { code: 'auto', label: t('settings.themeAuto') },
    { code: 'light', label: t('settings.themeLight') },
    { code: 'dark', label: t('settings.themeDark') },
  ];

  const selectedCurrencyLabel =
    CURRENCIES.find((c) => c.code === currencyCode)?.label ?? 'Euro (€)';
  const selectedLanguageLabel =
    LANGUAGES.find((l) => l.code === language)?.label ?? 'English';
  const selectedThemeLabel =
    THEME_OPTIONS.find((o) => o.code === themeMode)?.label ?? t('settings.themeAuto');

  const initials = displayName
    ? displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0].toUpperCase() ?? '?';

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <AppHeader title={t('header.settings_screen')} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* PERFIL */}
        <View style={[styles.profileCard, {
          backgroundColor: dc.surface, borderColor: dc.border,
        }]}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarInitials}>{initials}</Text>
          </View>
          <View style={styles.profileInfo}>
            {editingName ? (
              <View style={styles.nameEditRow}>
                <TextInput
                  value={nameInput}
                  onChangeText={setNameInput}
                  mode="flat"
                  style={[styles.nameEditInput, { backgroundColor: 'transparent' }]}
                  textColor={dc.textPrimary}
                  underlineColor={colors.primary}
                  activeUnderlineColor={colors.primary}
                  autoFocus
                  onSubmitEditing={handleSaveName}
                />
                <TouchableOpacity onPress={handleSaveName} style={styles.saveNameButton}>
                  <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.nameRow}
                onPress={() => setEditingName(true)}
              >
                <Text style={[styles.profileName, { color: dc.textPrimary }]}>
                  {displayName || t('settings.displayName')}
                </Text>
                <Ionicons name="pencil-outline" size={16} color={dc.textSecondary} />
              </TouchableOpacity>
            )}
            <Text style={[styles.profileEmail, { color: dc.textSecondary }]}>
              {user?.email ?? '—'}
            </Text>
          </View>
        </View>

        {/* PREFERENCIAS */}
        <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
          {t('settings.preferences')}
        </Text>
        <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
          <OptionRow
            icon="cash-outline" iconColor={colors.income}
            label={t('settings.currency')} value={selectedCurrencyLabel}
            onPress={() => setShowCurrencyModal(true)}
          />
          <View style={[styles.divider, { backgroundColor: dc.border }]} />
          <OptionRow
            icon="language-outline" iconColor={colors.primary}
            label={t('settings.language')} value={selectedLanguageLabel}
            onPress={() => setShowLanguageModal(true)}
          />
          <View style={[styles.divider, { backgroundColor: dc.border }]} />
          <OptionRow
            icon="moon-outline" iconColor={colors.primaryDark}
            label={t('settings.theme')} value={selectedThemeLabel}
            onPress={() => setShowThemeModal(true)}
          />
        </View>

        {/* NOTIFICACIONES */}
        <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
          {t('settings.notifications')}
        </Text>
        <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
          <OptionRow
            icon="notifications-outline" iconColor={colors.primary}
            label={t('settings.notifMovements')}
            subtitle={t('settings.notifMovementsSubtitle')}
            showArrow={false}
            right={
              <Switch
                value={dailyNotifEnabled}
                onValueChange={handleDailyNotif}
                trackColor={{ false: dc.border, true: colors.primary + '80' }}
                thumbColor={dailyNotifEnabled ? colors.primary : dc.textSecondary}
              />
            }
          />
        </View>

        {/* APLICACIÓN */}
        <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
          {t('settings.appSection')}
        </Text>
        <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
          <OptionRow
            icon="star-outline" iconColor="#F59E0B"
            label={t('settings.rateApp')}
            subtitle={t('settings.rateAppSubtitle')}
            onPress={handleRateApp}
          />
          <View style={[styles.divider, { backgroundColor: dc.border }]} />
          <OptionRow
            icon="share-social-outline" iconColor={colors.income}
            label={t('settings.shareApp')}
            subtitle={t('settings.shareAppSubtitle')}
            onPress={handleShare}
          />
          <View style={[styles.divider, { backgroundColor: dc.border }]} />
          <OptionRow
            icon="chatbubble-outline" iconColor={colors.primary}
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
            icon="trash-outline" iconColor={colors.expense}
            label={t('settings.deleteData')}
            subtitle={t('settings.deleteDataSubtitle')}
            onPress={handleDeleteData}
            dangerous
          />
          <View style={[styles.divider, { backgroundColor: dc.border }]} />
          <OptionRow
            icon="log-out-outline" iconColor={colors.expense}
            label={t('settings.logout')}
            onPress={handleLogout}
            dangerous
          />
        </View>

        {/* INFO */}
        <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>Info</Text>
        <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
          <OptionRow
            icon="information-circle-outline" iconColor={colors.primary}
            label={t('settings.version')}
            value={`v${appVersion}`}
            showArrow={false}
          />
        </View>

        <Text style={[styles.footer, { color: dc.textSecondary }]}>
          {t('settings.madeWith')}
        </Text>
      </ScrollView>

      <SelectModal
        visible={showCurrencyModal}
        title={t('settings.selectCurrency')}
        options={CURRENCIES.map((c) => ({ code: c.code, label: c.label }))}
        selectedValue={currencyCode}
        onSelect={(code) => saveSettings({ currencyCode: code })}
        onDismiss={() => setShowCurrencyModal(false)}
      />
      <SelectModal
        visible={showLanguageModal}
        title={t('settings.selectLanguage')}
        options={LANGUAGES}
        selectedValue={language}
        onSelect={(code) => saveSettings({ language: code })}
        onDismiss={() => setShowLanguageModal(false)}
      />
      <SelectModal
        visible={showThemeModal}
        title={t('settings.selectTheme')}
        options={THEME_OPTIONS}
        selectedValue={themeMode}
        onSelect={(code) => saveSettings({ themeMode: code as ThemeMode })}
        onDismiss={() => setShowThemeModal(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  profileCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, padding: 16, marginBottom: 20,
    borderWidth: 0.5, gap: 16,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarInitials: {
    fontSize: 22, fontFamily: 'Poppins_700Bold', color: '#FFFFFF',
  },
  profileInfo: { flex: 1 },
  nameEditRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  nameEditInput: {
    flex: 1, fontSize: 16,
    fontFamily: 'Poppins_600SemiBold', height: 40,
  },
  saveNameButton: { padding: 4 },
  nameRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  profileName: { fontSize: 16, fontFamily: 'Poppins_600SemiBold' },
  profileEmail: { fontSize: 13, fontFamily: 'Poppins_400Regular', marginTop: 2 },
  sectionLabel: {
    fontSize: 12, fontFamily: 'Poppins_600SemiBold',
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 8, marginLeft: 4,
  },
  card: { borderRadius: 16, marginBottom: 20, overflow: 'hidden', borderWidth: 0.5 },
  divider: { height: 0.5, marginLeft: 68 },
  optionRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  optionIcon: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  optionContent: { flex: 1 },
  optionLabel: { fontSize: 15, fontFamily: 'Poppins_500Medium' },
  optionSubtitle: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 2 },
  optionValue: { fontSize: 13, fontFamily: 'Poppins_400Regular', marginRight: 4 },
  footer: {
    textAlign: 'center', fontSize: 13,
    fontFamily: 'Poppins_400Regular', marginTop: 8, marginBottom: 16,
  },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalSheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40, maxHeight: '60%',
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontFamily: 'Poppins_700Bold', marginBottom: 16 },
  modalOption: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 0.5,
  },
  modalOptionText: { fontSize: 15, fontFamily: 'Poppins_400Regular' },
});

export default SettingsScreen;