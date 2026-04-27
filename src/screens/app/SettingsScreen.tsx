import React, { useState, useEffect } from 'react';
import {
  View, StyleSheet, ScrollView,
  TouchableOpacity, Alert, Linking, Share,
  Switch, Modal, FlatList, Clipboard, Platform,
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
import { useSettingsStore, CURRENCIES, LANGUAGES, ThemeMode, DateFormat } from '../../store/settingsStore';
import { COLOR_PALETTES, ColorPaletteId } from '../../theme';
import { useMovementStore } from '../../store/movementStore';
import { useSavingsStore } from '../../store/savingsStore';
import { usePremium } from '../../hooks/usePremium';
import { usePremiumStore } from '../../store/premiumStore';
import { useCategoryStore } from '../../store/categoryStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { useWalkthroughStore } from '../../store/walkthroughStore';
import { colors } from '../../theme';
import AppHeader from '../../components/common/AppHeader';
import PremiumModal from '../../components/common/PremiumModal';
import ColorPaletteModal from '../../components/common/ColorPaletteModal';
import i18n from '../../i18n';
import { logout, signInWithApple } from '../../services/firebase/auth.service';
import { exportMovementsToCSV } from '../../services/export.service';
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
        <Text style={[styles.optionLabel, { color: dangerous ? colors.expense : dc.textPrimary }]}>
          {label}
        </Text>
        {subtitle && (
          <Text style={[styles.optionSubtitle, { color: dc.textSecondary }]}>{subtitle}</Text>
        )}
      </View>
      {right ?? (
        <>
          {value && <Text style={[styles.optionValue, { color: dc.textSecondary }]}>{value}</Text>}
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
  const { colors: dc } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onDismiss} />
        <View style={[styles.modalSheet, { backgroundColor: dc.surface }]}>
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
                  styles.modalOptionText, { color: dc.textPrimary },
                  item.code === selectedValue && { color: dc.primary, fontFamily: 'Poppins_600SemiBold' },
                ]}>
                  {item.label}
                </Text>
                {item.code === selectedValue && (
                  <Ionicons name="checkmark" size={20} color={dc.primary} />
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

  const { displayName, currencyCode, language, themeMode, dateFormat, colorPalette, saveSettings } = useSettingsStore();
  const { isPremium, showModal, setShowModal, requirePremium } = usePremium();
  const { movements } = useMovementStore();
  const { huchas } = useSavingsStore();
  const {
    isSharedMode, sharedAccount, notificationsEnabled,
    setNotificationsEnabled, leaveSharedAccount, deleteSharedAccount,
    setSharedMode, getInviteLink, sharedCurrencyCode, sharedColorPalette,
    sharedDateFormat, saveSharedSettings,
  } = useSharedAccountStore();

  const { loadData } = useMovementStore();
  const user = auth().currentUser;
  const uid = user?.uid;
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  // Individual state
  const [isDeleting, setIsDeleting] = useState(false);
  const [dailyNotifEnabled, setDailyNotifEnabled] = useState(false);
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showDateFormatModal, setShowDateFormatModal] = useState(false);
  const [showColorPaletteModal, setShowColorPaletteModal] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(displayName ?? '');

  // Shared state
  const [linkCopied, setLinkCopied] = useState(false);
  const [editingSharedName, setEditingSharedName] = useState(false);
  const [newSharedName, setNewSharedName] = useState(sharedAccount?.name ?? '');
  const [showSharedCurrencyModal, setShowSharedCurrencyModal] = useState(false);
  const [showSharedDateFormatModal, setShowSharedDateFormatModal] = useState(false);
  const [showSharedColorPaletteModal, setShowSharedColorPaletteModal] = useState(false);
  const [showKickMemberModal, setShowKickMemberModal] = useState(false);

  useEffect(() => {
    loadNotifSettings();
    setNameInput(displayName ?? '');
  }, [displayName]);

  useEffect(() => {
    setNewSharedName(sharedAccount?.name ?? '');
  }, [sharedAccount?.name]);

  const loadNotifSettings = async () => {
    const val = await AsyncStorage.getItem(NOTIF_KEY);
    setDailyNotifEnabled(val === 'true');
  };

  // ── INDIVIDUAL HANDLERS ───────────────────────────────────────

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
        Alert.alert(t('reminders.permissionDenied'), t('reminders.permissionDeniedMessage'));
        return;
      }
      await Notifications.scheduleNotificationAsync({
        content: { title: '💰 MoFlo', body: t('settings.notifMovementsSubtitle'), sound: true },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: 20, minute: 0 },
      });
      Alert.alert('✅', t('settings.notifDailyEnabled'));
    } else {
      await Notifications.cancelAllScheduledNotificationsAsync();
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
              await AsyncStorage.multiRemove(['@moflo_movements', '@moflo_recurring', '@moflo_huchas', '@moflo_hucha_movements']);
              useMovementStore.getState().resetStore();
              useSavingsStore.getState().resetStore();
              if (uid) {
                const batch = firestore().batch();
                for (const col of ['movements', 'recurring', 'huchas', 'huchaMovements']) {
                  const snap = await firestore().collection('users').doc(uid).collection(col).get();
                  snap.docs.forEach(doc => batch.delete(doc.ref));
                }
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

  const handleDeleteAccount = () => {
    Alert.alert(
      t('settings.deleteAccount'),
      t('settings.deleteAccountWarning'),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        {
          text: t('settings.deleteAccount'),
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              t('settings.deleteAccountConfirm'),
              t('settings.deleteAccountConfirmMessage'),
              [
                { text: t('settings.cancel'), style: 'cancel' },
                {
                  text: t('settings.deleteAccount'),
                  style: 'destructive',
                  onPress: async () => {
                    if (isDeleting) return;
                    setIsDeleting(true);
                    try {
                      if (!uid) throw new Error('No user');

                      useSharedAccountStore.getState().unsubscribeAll();

                      const { sharedAccount: sa } = useSharedAccountStore.getState();
                      if (sa) {
                        const accountId = sa.id;
                        if (sa.createdBy === uid) {
                          const batch = firestore().batch();
                          for (const col of ['movements', 'recurring', 'categories', 'savings', 'huchas', 'huchaMovements']) {
                            const snap = await firestore()
                              .collection('sharedAccounts').doc(accountId)
                              .collection(col).get();
                            snap.docs.forEach(doc => batch.delete(doc.ref));
                          }
                          await batch.commit();
                          await firestore().collection('sharedAccounts').doc(accountId).delete();
                        } else {
                          const updatedMembers = sa.members.filter(m => m !== uid);
                          const updatedNames = { ...sa.memberNames };
                          delete updatedNames[uid];
                          await firestore()
                            .collection('sharedAccounts').doc(accountId)
                            .update({ members: updatedMembers, memberNames: updatedNames });
                        }
                      }

                      const userRef = firestore().collection('users').doc(uid);
                      const batch2 = firestore().batch();
                      for (const col of ['movements', 'recurring', 'categories', 'savings', 'huchas', 'huchaMovements']) {
                        const snap = await userRef.collection(col).get();
                        snap.docs.forEach(doc => batch2.delete(doc.ref));
                      }
                      await batch2.commit();
                      await userRef.delete();

                      await AsyncStorage.multiRemove([
                        '@moflo_movements', '@moflo_recurring', '@moflo_settings',
                        '@moflo_sync_queue', '@moflo_premium', '@moflo_custom_categories',
                        '@moflo_shared_account', '@moflo_active_account', '@moflo_savings',
                        '@moflo_daily_notif',
                        `@moflo_hidden_base_${uid}`, `@moflo_reminders_${uid}`, `@moflo_shared_notif_${uid}`,
                      ]);

                      useMovementStore.getState().resetStore();
                      useSettingsStore.getState().resetStore();
                      usePremiumStore.getState().setPremium(false);
                      useCategoryStore.getState().resetStore();
                      useSharedAccountStore.getState().resetStore();
                      useSavingsStore.getState().resetStore();

                      await auth().currentUser?.delete();
                    } catch (e: any) {
                      setIsDeleting(false);
                      if (e?.code === 'auth/requires-recent-login') {
                        const providerData = auth().currentUser?.providerData;
                        const isApple = providerData?.some(p => p.providerId === 'apple.com');
                        if (isApple) {
                          try {
                            await signInWithApple();
                            await auth().currentUser?.delete();
                            return;
                          } catch (_) {}
                        }
                        Alert.alert('Error', t('settings.deleteAccountError'));
                      } else {
                        Alert.alert('Error', t('settings.deleteAccountError'));
                      }
                    }
                  },
                },
              ]
            );
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

  // ── SHARED HANDLERS ───────────────────────────────────────────

  const handleRenameAccount = async () => {
    if (!newSharedName.trim() || !sharedAccount) return;
    try {
      await firestore()
        .collection('sharedAccounts')
        .doc(sharedAccount.id)
        .update({ name: newSharedName.trim() });
      useSharedAccountStore.setState({
        sharedAccount: { ...sharedAccount, name: newSharedName.trim() },
      });
      setEditingSharedName(false);
      Alert.alert('✅', t('sharedAccount.renameSuccess'));
    } catch (e) {
      Alert.alert('Error', t('sharedAccount.renameError'));
    }
  };

  const handleCopyLink = () => {
    Clipboard.setString(getInviteLink());
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleShareLink = async () => {
    if (!sharedAccount) return;
    await Share.share({
      message: `${t('sharedAccount.inviteInfo')}\n\n${getInviteLink()}`,
      title: `MoFlo — ${sharedAccount.name}`,
    });
  };

  const handleLeave = () => {
    Alert.alert(
      t('sharedAccount.leaveAccount'),
      t('sharedAccount.leaveConfirm'),
      [
        { text: t('movements.cancel'), style: 'cancel' },
        {
          text: t('sharedAccount.leaveAccount'),
          style: 'destructive',
          onPress: async () => {
            await leaveSharedAccount();
            await loadData();
            await setSharedMode(false);
            navigation.navigate('HomeTab');
          },
        },
      ]
    );
  };

  const handleDeleteShared = () => {
    Alert.alert(
      t('sharedAccount.deleteAccount'),
      t('sharedAccount.deleteWarning'),
      [
        { text: t('movements.cancel'), style: 'cancel' },
        {
          text: t('sharedAccount.exportFirst'),
          onPress: async () => {
            try { await exportMovementsToCSV(movements, huchas, t); } catch (e) {}
            confirmDeleteShared();
          },
        },
        {
          text: t('sharedAccount.deleteAnyway'),
          style: 'destructive',
          onPress: confirmDeleteShared,
        },
      ]
    );
  };

  const confirmDeleteShared = () => {
    Alert.alert(
      t('sharedAccount.deleteAccount'),
      t('sharedAccount.deleteConfirm'),
      [
        { text: t('movements.cancel'), style: 'cancel' },
        {
          text: t('sharedAccount.deleteAccount'),
          style: 'destructive',
          onPress: async () => {
            await deleteSharedAccount();
            await loadData();
            await setSharedMode(false);
            navigation.navigate('HomeTab');
          },
        },
      ]
    );
  };

  const handleKickMember = () => {
    if (!sharedAccount) return;
    const kickableMembers = sharedAccount.members.filter(m => m !== sharedAccount.createdBy);
    if (kickableMembers.length === 0) {
      Alert.alert('', t('sharedAccount.noMembersToKick'));
      return;
    }
    setShowKickMemberModal(true);
  };

  // ── SHARED ───────────────────────────────────────────────────

  const handleRateApp = async () => {
    if (await StoreReview.hasAction()) {
      await StoreReview.requestReview();
    } else {
      const url = Platform.OS === 'ios'
        ? 'itms-apps://itunes.apple.com/app/id6762832281?action=write-review'
        : 'https://play.google.com/store/apps/details?id=com.oskartech.moflo';
      Linking.openURL(url);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: '💰 Descarga MoFlo: https://play.google.com/store/apps/details?id=com.oskartech.moflo',
        title: 'MoFlo — Control de finanzas',
      });
    } catch (e) {}
  };

  const handleExportCSV = () => {
    if (isSharedMode) {
      exportMovementsToCSV(movements, huchas, t).catch(() => {
        Alert.alert('Error', t('export.error'));
      });
    } else {
      requirePremium(async () => {
        try {
          await exportMovementsToCSV(movements, huchas, t);
        } catch (e) {
          Alert.alert('Error', t('export.error'));
        }
      });
    }
  };

  // ── COMPUTED VALUES ───────────────────────────────────────────

  const THEME_OPTIONS: { code: ThemeMode; label: string }[] = [
    { code: 'auto', label: t('settings.themeAuto') },
    { code: 'light', label: t('settings.themeLight') },
    { code: 'dark', label: t('settings.themeDark') },
  ];

  const DATE_FORMAT_OPTIONS: { code: DateFormat; label: string }[] = [
    { code: 'DD/MM/YYYY', label: t('settings.dateFormatDMY') },
    { code: 'MM/DD/YYYY', label: t('settings.dateFormatMDY') },
  ];

  const selectedCurrencyLabel = CURRENCIES.find(c => c.code === currencyCode)?.label ?? 'Euro (€)';
  const selectedLanguageLabel = LANGUAGES.find(l => l.code === language)?.label ?? 'English';
  const selectedThemeLabel = THEME_OPTIONS.find(o => o.code === themeMode)?.label ?? t('settings.themeAuto');
  const selectedDateFormatLabel = DATE_FORMAT_OPTIONS.find(o => o.code === dateFormat)?.label ?? 'DD/MM/YYYY';
  const selectedPaletteId: ColorPaletteId = colorPalette && colorPalette in COLOR_PALETTES ? colorPalette : 'green';
  const selectedPaletteLabel = t(`settings.palette${selectedPaletteId.charAt(0).toUpperCase() + selectedPaletteId.slice(1)}`);

  const selectedSharedCurrencyLabel = CURRENCIES.find(c => c.code === sharedCurrencyCode)?.label ?? 'Euro (€)';
  const selectedSharedPaletteId: ColorPaletteId = sharedColorPalette && sharedColorPalette in COLOR_PALETTES ? sharedColorPalette : 'blue';
  const selectedSharedDateFormatLabel = DATE_FORMAT_OPTIONS.find(o => o.code === sharedDateFormat)?.label ?? 'DD/MM/YYYY';

  const initials = displayName
    ? displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0].toUpperCase() ?? '?';

  const isCreator = sharedAccount?.createdBy === uid;
  const kickableMembers = sharedAccount
    ? sharedAccount.members.filter(m => m !== sharedAccount.createdBy)
    : [];

  return (
    <View style={[styles.container, { backgroundColor: dc.background }]}>
      <AppHeader title={t('header.settings_screen')} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── SECCIÓN 1: CABECERA ─────────────────────────────── */}
        {!isSharedMode ? (
          <>
            {/* Perfil individual */}
            <View style={[styles.profileCard, { backgroundColor: dc.surface, borderColor: dc.border }]}>
              <View style={[styles.avatar, { backgroundColor: dc.primary }]}>
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
                      underlineColor={dc.primary}
                      activeUnderlineColor={dc.primary}
                      autoFocus
                      onSubmitEditing={handleSaveName}
                    />
                    <TouchableOpacity onPress={handleSaveName} style={styles.saveNameButton}>
                      <Ionicons name="checkmark-circle" size={24} color={dc.primary} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.nameRow} onPress={() => setEditingName(true)}>
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

            {/* Upgrade o cuenta compartida */}
            {!isPremium ? (
              <TouchableOpacity
                style={[styles.upgradeCard, { borderColor: colors.savings }]}
                onPress={() => setShowModal(true)}
                activeOpacity={0.8}
              >
                <View style={styles.upgradeLeft}>
                  <Text style={styles.upgradeEmoji}>⭐</Text>
                  <View>
                    <Text style={[styles.upgradeTitle, { color: dc.textPrimary }]}>{t('premium.title')}</Text>
                    <Text style={[styles.upgradeSubtitle, { color: dc.textSecondary }]}>2,99€</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.savings} />
              </TouchableOpacity>
            ) : (
              <>
                <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
                  {t('sharedAccount.title')}
                </Text>
                <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
                  <OptionRow
                    icon="people-outline"
                    iconColor={dc.primary}
                    label={sharedAccount?.name ?? t('sharedAccount.title')}
                    subtitle={sharedAccount
                      ? `${sharedAccount.members.length} ${t('sharedAccount.members').toLowerCase()}`
                      : t('sharedAccount.noAccount')}
                    onPress={async () => {
                      if (sharedAccount) {
                        await setSharedMode(true);
                        navigation.navigate('HomeTab');
                      } else {
                        navigation.navigate('SharedAccount');
                      }
                    }}
                  />
                </View>
              </>
            )}
          </>
        ) : (
          <>
            {/* Cuenta compartida — card principal */}
            <View style={[styles.accountCard, { backgroundColor: dc.primary }]}>
              <Text style={styles.accountEmoji}>👥</Text>
              {editingSharedName && isCreator ? (
                <View style={styles.renameRow}>
                  <TextInput
                    value={newSharedName}
                    onChangeText={setNewSharedName}
                    mode="flat"
                    style={[styles.renameInput, { backgroundColor: 'transparent' }]}
                    textColor="#FFFFFF"
                    underlineColor="rgba(255,255,255,0.5)"
                    activeUnderlineColor="#FFFFFF"
                    autoFocus
                    onSubmitEditing={handleRenameAccount}
                  />
                  <TouchableOpacity onPress={handleRenameAccount} style={styles.renameConfirm}>
                    <Ionicons name="checkmark-circle" size={28} color="#FFFFFF" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => {
                    setEditingSharedName(false);
                    setNewSharedName(sharedAccount?.name ?? '');
                  }}>
                    <Ionicons name="close-circle" size={28} color="rgba(255,255,255,0.6)" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.sharedNameRow}
                  onPress={() => isCreator && setEditingSharedName(true)}
                  activeOpacity={isCreator ? 0.7 : 1}
                >
                  <Text style={styles.accountName}>{sharedAccount?.name ?? ''}</Text>
                  {isCreator && (
                    <Ionicons name="pencil-outline" size={16} color="rgba(255,255,255,0.7)" />
                  )}
                </TouchableOpacity>
              )}
              <Text style={styles.accountCode}>
                {t('sharedAccount.code')}: {sharedAccount?.inviteCode ?? ''}
              </Text>
            </View>

            {/* Enlace de invitación */}
            <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
              {t('sharedAccount.inviteLink')}
            </Text>
            <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border, padding: 16 }]}>
              <Text style={[styles.inviteInfo, { color: dc.textSecondary }]}>
                {t('sharedAccount.inviteInfo')}
              </Text>
              <Text style={[styles.linkText, { color: dc.textPrimary }]} numberOfLines={2}>
                {getInviteLink()}
              </Text>
              <View style={styles.linkButtons}>
                <TouchableOpacity
                  style={[styles.linkBtn, { backgroundColor: linkCopied ? colors.income + '20' : dc.background }]}
                  onPress={handleCopyLink}
                >
                  <Ionicons
                    name={linkCopied ? 'checkmark-circle' : 'copy-outline'}
                    size={16}
                    color={linkCopied ? colors.income : dc.primary}
                  />
                  <Text style={[styles.linkBtnText, { color: linkCopied ? colors.income : dc.primary }]}>
                    {linkCopied ? t('sharedAccount.linkCopied') : t('sharedAccount.copyLink')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.linkBtn, { backgroundColor: dc.background }]}
                  onPress={handleShareLink}
                >
                  <Ionicons name="share-social-outline" size={16} color={dc.primary} />
                  <Text style={[styles.linkBtnText, { color: dc.primary }]}>
                    {t('sharedAccount.shareLink')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Miembros */}
            <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
              {t('sharedAccount.members')} ({sharedAccount?.members.length ?? 0})
            </Text>
            <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
              {sharedAccount?.members.map((memberId, index) => {
                const name = sharedAccount.memberNames[memberId] ?? 'Usuario';
                const isMe = memberId === uid;
                const isMemberCreator = memberId === sharedAccount.createdBy;
                return (
                  <View key={memberId}>
                    <View style={styles.memberRow}>
                      <View style={[styles.memberAvatar, { backgroundColor: dc.primary + '20' }]}>
                        <Text style={[styles.memberInitial, { color: dc.primary }]}>
                          {name[0].toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.memberInfo}>
                        <Text style={[styles.memberName, { color: dc.textPrimary }]}>
                          {name}{isMe ? ` ${t('sharedAccount.you')}` : ''}
                        </Text>
                        {isMemberCreator && (
                          <Text style={[styles.memberRole, { color: dc.textSecondary }]}>
                            {t('sharedAccount.creator')}
                          </Text>
                        )}
                      </View>
                    </View>
                    {index < sharedAccount.members.length - 1 && (
                      <View style={[styles.divider, { backgroundColor: dc.border }]} />
                    )}
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ── SECCIÓN 2: PREFERENCIAS ─────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
          {t('settings.preferences')}
        </Text>
        <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
          {!isSharedMode ? (
            <>
              <OptionRow
                icon="cash-outline" iconColor={dc.primary}
                label={t('settings.currency')} value={selectedCurrencyLabel}
                onPress={() => setShowCurrencyModal(true)}
              />
              <View style={[styles.divider, { backgroundColor: dc.border }]} />
              <OptionRow
                icon="language-outline" iconColor={dc.primary}
                label={t('settings.language')} value={selectedLanguageLabel}
                onPress={() => setShowLanguageModal(true)}
              />
              <View style={[styles.divider, { backgroundColor: dc.border }]} />
              <OptionRow
                icon="calendar-outline" iconColor={dc.primary}
                label={t('settings.dateFormat')} value={selectedDateFormatLabel}
                onPress={() => setShowDateFormatModal(true)}
              />
              <View style={[styles.divider, { backgroundColor: dc.border }]} />
              <OptionRow
                icon="color-palette-outline" iconColor={dc.primary}
                label={t('settings.colorPalette')}
                subtitle={!isPremium ? `⭐ ${t('premium.badge')}` : undefined}
                onPress={() => requirePremium(() => setShowColorPaletteModal(true))}
                right={isPremium ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: COLOR_PALETTES[selectedPaletteId].primary }} />
                    <Text style={[styles.optionValue, { color: dc.textSecondary }]}>{selectedPaletteLabel}</Text>
                    <Ionicons name="chevron-forward" size={18} color={dc.textSecondary} />
                  </View>
                ) : undefined}
              />
              <View style={[styles.divider, { backgroundColor: dc.border }]} />
              <OptionRow
                icon="pricetag-outline" iconColor={dc.primary}
                label={t('categories.title')}
                subtitle={!isPremium
                  ? `⭐ ${t('premium.badge')}`
                  : t('settings.individualCategoriesSubtitle')}
                onPress={() => requirePremium(() => navigation.navigate('Categories'))}
              />
              <View style={[styles.divider, { backgroundColor: dc.border }]} />
              <OptionRow
                icon="notifications-outline" iconColor={dc.primary}
                label={t('settings.notifMovements')}
                subtitle={t('settings.notifMovementsSubtitle')}
                showArrow={false}
                right={
                  <Switch
                    value={dailyNotifEnabled}
                    onValueChange={handleDailyNotif}
                    trackColor={{ false: dc.border, true: dc.primary + '80' }}
                    thumbColor={dailyNotifEnabled ? dc.primary : dc.textSecondary}
                  />
                }
              />
            </>
          ) : (
            <>
              <OptionRow
                icon="cash-outline" iconColor={dc.primary}
                label={t('settings.currency')} value={selectedSharedCurrencyLabel}
                onPress={() => setShowSharedCurrencyModal(true)}
              />
              <View style={[styles.divider, { backgroundColor: dc.border }]} />
              <OptionRow
                icon="calendar-outline" iconColor={dc.primary}
                label={t('settings.dateFormat')} value={selectedSharedDateFormatLabel}
                onPress={() => setShowSharedDateFormatModal(true)}
              />
              <View style={[styles.divider, { backgroundColor: dc.border }]} />
              <OptionRow
                icon="color-palette-outline" iconColor={dc.primary}
                label={t('settings.colorPalette')}
                right={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: COLOR_PALETTES[selectedSharedPaletteId].primary }} />
                    <Ionicons name="chevron-forward" size={18} color={dc.textSecondary} />
                  </View>
                }
                onPress={() => setShowSharedColorPaletteModal(true)}
              />
              <View style={[styles.divider, { backgroundColor: dc.border }]} />
              <OptionRow
                icon="pricetag-outline" iconColor={dc.primary}
                label={t('categories.title')}
                subtitle={t('sharedAccount.sharedCategoriesSubtitle')}
                onPress={() => sharedAccount && navigation.navigate('SharedCategories', { accountId: sharedAccount.id })}
              />
              <View style={[styles.divider, { backgroundColor: dc.border }]} />
              <OptionRow
                icon="notifications-outline" iconColor={dc.primary}
                label={t('sharedAccount.notifTitle')}
                subtitle={t('sharedAccount.notifSubtitle')}
                showArrow={false}
                right={
                  <Switch
                    value={notificationsEnabled}
                    onValueChange={setNotificationsEnabled}
                    trackColor={{ false: dc.border, true: dc.primary + '80' }}
                    thumbColor={notificationsEnabled ? dc.primary : dc.textSecondary}
                  />
                }
              />
            </>
          )}
        </View>

        {/* ── SECCIÓN 3: APLICACIÓN (igual en ambos modos) ──────── */}
        <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
          {t('settings.appSection')}
        </Text>
        <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
          <OptionRow
            icon="compass-outline" iconColor={dc.primary}
            label={t('walkthrough.settingsLabel')} subtitle={t('walkthrough.settingsSubtitle')}
            onPress={() => {
              navigation.navigate('HomeTab' as never);
              setTimeout(() => useWalkthroughStore.getState().start(), 250);
            }}
          />
          <View style={[styles.divider, { backgroundColor: dc.border }]} />
          <OptionRow
            icon="star-outline" iconColor={dc.primary}
            label={t('settings.rateApp')} subtitle={t('settings.rateAppSubtitle')}
            onPress={handleRateApp}
          />
          <View style={[styles.divider, { backgroundColor: dc.border }]} />
          <OptionRow
            icon="share-social-outline" iconColor={dc.primary}
            label={t('settings.shareApp')} subtitle={t('settings.shareAppSubtitle')}
            onPress={handleShare}
          />
          <View style={[styles.divider, { backgroundColor: dc.border }]} />
          <OptionRow
            icon="download-outline" iconColor={dc.primary}
            label={t('export.title')}
            subtitle={!isSharedMode && !isPremium
              ? `⭐ ${t('premium.badge')}`
              : t(isSharedMode ? 'sharedAccount.exportSubtitle' : 'settings.individualExportSubtitle')}
            onPress={handleExportCSV}
          />
          {!isSharedMode && (
            <>
              <View style={[styles.divider, { backgroundColor: dc.border }]} />
              <OptionRow
                icon="moon-outline" iconColor={dc.primary}
                label={t('settings.theme')} value={selectedThemeLabel}
                onPress={() => setShowThemeModal(true)}
              />
            </>
          )}
          <View style={[styles.divider, { backgroundColor: dc.border }]} />
          <OptionRow
            icon="chatbubble-outline" iconColor={dc.primary}
            label={t('settings.support')} subtitle={t('settings.supportSubtitle')}
            onPress={() => navigation.navigate('Support')}
          />
        </View>

        {/* ── SECCIÓN 4: CUENTA ────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>
          {t('settings.accountSection')}
        </Text>
        <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
          {!isSharedMode ? (
            <>
              <OptionRow
                icon="trash-outline" iconColor={colors.expense}
                label={t('settings.deleteData')} subtitle={t('settings.deleteDataSubtitle')}
                onPress={handleDeleteData} dangerous
              />
              <View style={[styles.divider, { backgroundColor: dc.border }]} />
              <OptionRow
                icon="person-remove-outline" iconColor={colors.expense}
                label={t('settings.deleteAccount')} subtitle={t('settings.deleteAccountSubtitle')}
                onPress={isDeleting ? undefined : handleDeleteAccount} dangerous
              />
              <View style={[styles.divider, { backgroundColor: dc.border }]} />
              <OptionRow
                icon="log-out-outline" iconColor={colors.expense}
                label={t('settings.logout')}
                onPress={handleLogout} dangerous
              />
            </>
          ) : (
            <>
              {isCreator && (
                <>
                  <OptionRow
                    icon="pencil-outline" iconColor={dc.primary}
                    label={t('sharedAccount.renameAccount')}
                    onPress={() => setEditingSharedName(true)}
                  />
                  <View style={[styles.divider, { backgroundColor: dc.border }]} />
                </>
              )}
              {isCreator && kickableMembers.length > 0 && (
                <>
                  <OptionRow
                    icon="person-remove-outline" iconColor={colors.expense}
                    label={t('sharedAccount.kickMember')}
                    onPress={handleKickMember} dangerous
                  />
                  <View style={[styles.divider, { backgroundColor: dc.border }]} />
                </>
              )}
              {!isCreator && (
                <>
                  <OptionRow
                    icon="exit-outline" iconColor={colors.expense}
                    label={t('sharedAccount.leaveAccount')}
                    onPress={handleLeave} dangerous
                  />
                  <View style={[styles.divider, { backgroundColor: dc.border }]} />
                </>
              )}
              {isCreator && (
                <>
                  <OptionRow
                    icon="trash-outline" iconColor={colors.expense}
                    label={t('sharedAccount.deleteAccount')}
                    onPress={handleDeleteShared} dangerous
                  />
                  <View style={[styles.divider, { backgroundColor: dc.border }]} />
                </>
              )}
              <OptionRow
                icon="log-out-outline" iconColor={colors.expense}
                label={t('settings.logout')}
                onPress={handleLogout} dangerous
              />
            </>
          )}
        </View>

        {/* ── SECCIÓN 5: INFO (igual en ambos modos) ───────────── */}
        <Text style={[styles.sectionLabel, { color: dc.textSecondary }]}>Info</Text>
        <View style={[styles.card, { backgroundColor: dc.surface, borderColor: dc.border }]}>
          <OptionRow
            icon="information-circle-outline" iconColor={dc.primary}
            label={t('settings.version')} value={`v${appVersion}`} showArrow={false}
          />
          <View style={[styles.divider, { backgroundColor: dc.border }]} />
          <OptionRow
            icon="document-text-outline" iconColor={dc.primary}
            label={t('settings.privacyPolicy')}
            onPress={() => Linking.openURL('https://oskartech.github.io/privacy.html')}
          />
          <View style={[styles.divider, { backgroundColor: dc.border }]} />
          <OptionRow
            icon="shield-checkmark-outline" iconColor={dc.primary}
            label={t('settings.termsOfService')}
            onPress={() => Linking.openURL('https://oskartech.github.io/terms.html')}
          />
        </View>

        <Text style={[styles.footer, { color: dc.textSecondary }]}>
          {t('settings.madeWith')}
        </Text>
      </ScrollView>

      {/* ── MODALES INDIVIDUALES ─────────────────────────────── */}
      <SelectModal
        visible={showCurrencyModal} title={t('settings.selectCurrency')}
        options={CURRENCIES.map(c => ({ code: c.code, label: c.label }))}
        selectedValue={currencyCode}
        onSelect={code => saveSettings({ currencyCode: code })}
        onDismiss={() => setShowCurrencyModal(false)}
      />
      <SelectModal
        visible={showLanguageModal} title={t('settings.selectLanguage')}
        options={LANGUAGES} selectedValue={language}
        onSelect={async (code) => {
          await saveSettings({ language: code });
          if (dailyNotifEnabled) {
            await Notifications.cancelAllScheduledNotificationsAsync();
            await Notifications.scheduleNotificationAsync({
              content: { title: '💰 MoFlo', body: i18n.t('settings.notifMovementsSubtitle'), sound: true },
              trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: 20, minute: 0 },
            });
          }
        }}
        onDismiss={() => setShowLanguageModal(false)}
      />
      <SelectModal
        visible={showThemeModal} title={t('settings.selectTheme')}
        options={THEME_OPTIONS} selectedValue={themeMode}
        onSelect={code => saveSettings({ themeMode: code as ThemeMode })}
        onDismiss={() => setShowThemeModal(false)}
      />
      <SelectModal
        visible={showDateFormatModal} title={t('settings.selectDateFormat')}
        options={DATE_FORMAT_OPTIONS} selectedValue={dateFormat}
        onSelect={code => saveSettings({ dateFormat: code as DateFormat })}
        onDismiss={() => setShowDateFormatModal(false)}
      />
      <ColorPaletteModal
        visible={showColorPaletteModal}
        selectedPalette={selectedPaletteId}
        onSelect={(id) => saveSettings({ colorPalette: id })}
        onDismiss={() => setShowColorPaletteModal(false)}
      />

      {/* ── MODALES COMPARTIDOS ──────────────────────────────── */}
      <SelectModal
        visible={showSharedCurrencyModal} title={t('settings.selectCurrency')}
        options={CURRENCIES.map(c => ({ code: c.code, label: c.label }))}
        selectedValue={sharedCurrencyCode}
        onSelect={code => sharedAccount && saveSharedSettings(sharedAccount.id, { currencyCode: code })}
        onDismiss={() => setShowSharedCurrencyModal(false)}
      />
      <SelectModal
        visible={showSharedDateFormatModal} title={t('settings.selectDateFormat')}
        options={DATE_FORMAT_OPTIONS} selectedValue={sharedDateFormat}
        onSelect={code => sharedAccount && saveSharedSettings(sharedAccount.id, { dateFormat: code })}
        onDismiss={() => setShowSharedDateFormatModal(false)}
      />
      <ColorPaletteModal
        visible={showSharedColorPaletteModal}
        selectedPalette={selectedSharedPaletteId}
        onSelect={(id) => sharedAccount && saveSharedSettings(sharedAccount.id, { colorPalette: id })}
        onDismiss={() => setShowSharedColorPaletteModal(false)}
      />

      {/* ── MODAL EXPULSAR MIEMBRO ───────────────────────────── */}
      <Modal
        visible={showKickMemberModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowKickMemberModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowKickMemberModal(false)}
          />
          <View style={[styles.modalSheet, { backgroundColor: dc.surface }]}>
            <View style={[styles.modalHandle, { backgroundColor: dc.border }]} />
            <Text style={[styles.modalTitle, { color: dc.textPrimary }]}>
              {t('sharedAccount.kickMember')}
            </Text>
            <FlatList
              data={kickableMembers}
              keyExtractor={(item) => item}
              renderItem={({ item: memberId }) => {
                const name = sharedAccount?.memberNames?.[memberId] ?? 'Usuario';
                return (
                  <TouchableOpacity
                    style={[styles.modalOption, { borderBottomColor: dc.border }]}
                    onPress={() => {
                      setShowKickMemberModal(false);
                      Alert.alert(
                        t('sharedAccount.kickMember'),
                        `${t('sharedAccount.kickConfirm')} ${name}?\n\n${t('sharedAccount.kickWarning')}`,
                        [
                          { text: t('settings.cancel'), style: 'cancel' },
                          {
                            text: t('sharedAccount.kick'),
                            style: 'destructive',
                            onPress: async () => {
                              if (!sharedAccount) return;
                              const updatedMembers = sharedAccount.members.filter(m => m !== memberId);
                              const updatedNames = { ...sharedAccount.memberNames };
                              delete updatedNames[memberId];
                              await firestore()
                                .collection('sharedAccounts')
                                .doc(sharedAccount.id)
                                .update({ members: updatedMembers, memberNames: updatedNames });
                              Alert.alert('✅', t('sharedAccount.kickSuccess'));
                            },
                          },
                        ]
                      );
                    }}
                  >
                    <View style={[styles.memberAvatar, { backgroundColor: dc.primary + '20' }]}>
                      <Text style={[styles.memberInitial, { color: dc.primary }]}>
                        {name[0].toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[styles.modalOptionText, { color: dc.textPrimary, flex: 1, marginLeft: 12 }]}>
                      {name}
                    </Text>
                    <Ionicons name="person-remove-outline" size={18} color={colors.expense} />
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      <PremiumModal
        visible={showModal}
        onDismiss={() => setShowModal(false)}
        onPurchase={() => setShowModal(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  // Individual profile
  profileCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 0.5, gap: 16,
  },
  avatar: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  avatarInitials: { fontSize: 22, fontFamily: 'Poppins_700Bold', color: '#FFFFFF' },
  profileInfo: { flex: 1 },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameEditInput: { flex: 1, fontSize: 16, fontFamily: 'Poppins_600SemiBold', height: 40 },
  saveNameButton: { padding: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  profileName: { fontSize: 16, fontFamily: 'Poppins_600SemiBold' },
  profileEmail: { fontSize: 13, fontFamily: 'Poppins_400Regular', marginTop: 2 },

  // Upgrade
  upgradeCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1.5,
    backgroundColor: colors.savings + '10',
  },
  upgradeLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  upgradeEmoji: { fontSize: 28 },
  upgradeTitle: { fontSize: 16, fontFamily: 'Poppins_700Bold' },
  upgradeSubtitle: { fontSize: 13, fontFamily: 'Poppins_400Regular', marginTop: 2 },

  // Shared account card
  accountCard: {
    borderRadius: 20, padding: 24,
    alignItems: 'center', marginBottom: 24, elevation: 4,
  },
  accountEmoji: { fontSize: 36, marginBottom: 8 },
  sharedNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  accountName: { fontSize: 20, fontFamily: 'Poppins_700Bold', color: '#FFFFFF', textAlign: 'center' },
  accountCode: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: 'rgba(255,255,255,0.7)' },
  renameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', marginBottom: 4 },
  renameInput: { flex: 1, fontSize: 18 },
  renameConfirm: { padding: 4 },

  // Invite link
  inviteInfo: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginBottom: 8 },
  linkText: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginBottom: 12, lineHeight: 18 },
  linkButtons: { flexDirection: 'row', gap: 8 },
  linkBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, padding: 10, borderRadius: 10,
  },
  linkBtnText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },

  // Members
  memberRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  memberAvatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  memberInitial: { fontSize: 18, fontFamily: 'Poppins_700Bold' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontFamily: 'Poppins_500Medium' },
  memberRole: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 2 },

  // Common
  sectionLabel: {
    fontSize: 12, fontFamily: 'Poppins_600SemiBold',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginLeft: 4,
  },
  card: { borderRadius: 16, marginBottom: 20, overflow: 'hidden', borderWidth: 0.5 },
  divider: { height: 0.5, marginLeft: 68 },
  optionRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  optionIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  optionContent: { flex: 1 },
  optionLabel: { fontSize: 15, fontFamily: 'Poppins_500Medium' },
  optionSubtitle: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 2 },
  optionValue: { fontSize: 13, fontFamily: 'Poppins_400Regular', marginRight: 4 },
  footer: { textAlign: 'center', fontSize: 13, fontFamily: 'Poppins_400Regular', marginTop: 8, marginBottom: 16 },

  // Modals
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, maxHeight: '60%' },
  modalHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontFamily: 'Poppins_700Bold', marginBottom: 16 },
  modalOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 0.5 },
  modalOptionText: { fontSize: 15, fontFamily: 'Poppins_400Regular' },
});

export default SettingsScreen;
