import React, { useState, useEffect, useCallback } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Alert, Linking, Share,
  Switch, Platform, Clipboard, BackHandler,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
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
import { useReminderStore } from '../../store/reminderStore';
import { useWalkthroughStore } from '../../store/walkthroughStore';
import PremiumModal from '../../components/common/PremiumModal';
import ColorPaletteModal from '../../components/common/ColorPaletteModal';
import BottomSheet, { SheetButton, FilledInput } from '../../components/common/BottomSheet';
import { HeroScrollScreen } from '../../components/layout/HeroScreen';
import { HeroTitleBar } from '../../components/layout/HeroBar';
import { getTabBeforeSettings } from '../../navigation/navigationRef';
import { SettingsSection, SettingsRow } from '../../components/settings/SettingsRows';
import { OptionSheet, AppearanceSheet, FontSheet } from '../../components/settings/SettingsSheets';
import i18n from '../../i18n';
import { logout } from '../../services/firebase/auth.service';
import { clearPushTokens } from '../../services/firebase/pushTokens.service';
import { clearQueueForUser, clearPersonalQueueForUser } from '../../services/syncQueue.service';
import { revokeAppleToken } from '../../services/firebase/appleAuth';
import { reportError } from '../../services/crashReporting';
import { resetPurchasesUser } from '../../services/revenuecat';
import { deleteSubcollections } from '../../services/firebase/batchDelete';
import { reauthenticate, needsPasswordToReauthenticate } from '../../services/firebase/reauth.service';
import ExportDataModal from '../../components/common/ExportDataModal';
import { scheduleDailyNotification, cancelDailyNotification } from '../../services/notifications.service';
import Constants from 'expo-constants';
import { reloadAppAsync } from 'expo';
import { lightHaptic, warningHaptic } from '../../utils/haptics';
import { LIQUID_GLASS_AVAILABLE } from '../../utils/liquidGlass';
import { withAlpha } from '../../utils/color';
import { FONT_OPTIONS, AppFontId, getSavedFont, saveFont, getActiveFont } from '../../theme/fonts';

const NOTIF_KEY = '@moflo_daily_notif';

// Nombre de la moneda en el idioma de la app, sin el símbolo entre paréntesis
const currencyName = (label: string) => label.replace(/\s*\([^)]*\)\s*$/, '');

// Una fecha de ejemplo (hoy) con cada formato
const sampleDate = (format: DateFormat) => {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return format === 'MM/DD/YYYY' ? `${month}/${day}/${d.getFullYear()}` : `${day}/${month}/${d.getFullYear()}`;
};

const SettingsScreen = () => {
  const { t } = useTranslation();
  const { colors: dc, ui } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();

  // Ajustes se abre desde la tuerca de cualquier pantalla: volver lleva a la
  // pantalla de la que se vino, no siempre a Inicio
  const goBack = useCallback(() => {
    navigation.navigate(getTabBeforeSettings());
  }, [navigation]);

  // El botón atrás de Android hace lo mismo que la flecha (sin esto iría a Inicio)
  useFocusEffect(useCallback(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => sub.remove();
  }, [goBack]));

  const {
    displayName, currencyCode, language, themeMode, dateFormat, colorPalette, hapticsEnabled, liquidGlassEnabled,
    saveSettings,
  } = useSettingsStore();
  const { isPremium, showModal, setShowModal, requirePremium } = usePremium();
  const {
    isSharedMode, sharedAccount, notificationsEnabled,
    setNotificationsEnabled, leaveSharedAccount, deleteSharedAccount,
    setSharedMode, getInviteLink, sharedCurrencyCode, sharedColorPalette,
    sharedDateFormat, saveSharedSettings,
    incomingRequests, approveJoinRequest, rejectJoinRequest,
  } = useSharedAccountStore();
  const visibleRequests = incomingRequests.filter(r => r.status === 'pending');

  const { loadData } = useMovementStore();
  const user = auth().currentUser;
  const uid = user?.uid;
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  // Individual state
  const [isDeleting, setIsDeleting] = useState(false);
  // Reautenticación previa al borrado de cuenta. Solo las cuentas de correo y
  // contraseña necesitan el modal: Apple y Google abren su propia hoja.
  const [showReauthModal, setShowReauthModal] = useState(false);
  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthError, setReauthError] = useState('');
  const [isReauthenticating, setIsReauthenticating] = useState(false);
  const [dailyNotifEnabled, setDailyNotifEnabled] = useState(false);
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showDateFormatModal, setShowDateFormatModal] = useState(false);
  const [showColorPaletteModal, setShowColorPaletteModal] = useState(false);
  const [showFontModal, setShowFontModal] = useState(false);
  // Elegir formato de exportación; 'beforeDelete': al terminar sigue con el borrado de la cuenta compartida
  const [exportMode, setExportMode] = useState<null | 'export' | 'beforeDelete'>(null);
  const [selectedFont, setSelectedFont] = useState<AppFontId>(getActiveFont());
  const [editingName, setEditingName] = useState(false);

  // La fuente guardada puede no ser la activa si aún no se ha reiniciado la app
  useEffect(() => {
    getSavedFont().then(setSelectedFont);
  }, []);
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
      // Solo reprograma la diaria: cancelar todas borraría también los recordatorios
      await scheduleDailyNotification(t('settings.notifMovementsSubtitle'));
      Alert.alert('✅', t('settings.notifDailyEnabled'));
    } else {
      await cancelDailyNotification();
    }
  };

  const handleDeleteData = () => {
    warningHaptic();
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
              // Lo pendiente de subir se descarta primero: si no, la cola lo
              // volvía a subir después del borrado. Solo lo personal de este
              // usuario; lo de sus cuentas compartidas sigue su curso.
              if (uid) await clearPersonalQueueForUser(uid);
              await AsyncStorage.multiRemove(['@moflo_movements', '@moflo_recurring', '@moflo_huchas', '@moflo_hucha_movements']);
              useMovementStore.getState().resetStore();
              useSavingsStore.getState().resetStore();
              if (uid) {
                // En lotes de 450: con un solo lote, quien tuviera más de 500
                // documentos no podía borrar sus datos
                await deleteSubcollections(
                  firestore().collection('users').doc(uid),
                  ['movements', 'recurring', 'huchas', 'huchaMovements'],
                );
              }
              Alert.alert('✅', t('settings.deleteDataSuccess'));
            } catch (e) {
              reportError(e, 'deleteData');
              Alert.alert(t('common.error'), t('settings.deleteDataError'));
            }
          },
        },
      ]
    );
  };

  // Borrado efectivo. Solo se llama cuando la identidad ya está verificada, así
  // que a estas alturas `user.delete()` no puede fallar por sesión antigua y
  // dejar la cuenta medio destruida.
  const performAccountDeletion = async () => {
    if (!uid) return;
    setIsDeleting(true);
    try {
      useSharedAccountStore.getState().unsubscribeAll();

      const { sharedAccount: sa } = useSharedAccountStore.getState();
      if (sa) {
        const accountId = sa.id;
        if (sa.createdBy === uid) {
          const accountRef = firestore().collection('sharedAccounts').doc(accountId);
          // En lotes de 450: con un solo lote, una cuenta con más de 500
          // documentos no se podía borrar nunca
          await deleteSubcollections(accountRef, [
            'movements', 'recurring', 'categories', 'savings',
            'huchas', 'huchaMovements', 'reminders', 'joinRequests',
          ]);
          await accountRef.delete();
        } else {
          // Solo se quita a uno mismo, sin reescribir la lista con la copia local.
          // Aquí el nombre sí se borra, porque borra su cuenta y con ella sus
          // datos: lo que añadió queda firmado como antiguo miembro.
          await firestore()
            .collection('sharedAccounts').doc(accountId)
            .update({
              members: firestore.FieldValue.arrayRemove(uid),
              [`memberNames.${uid}`]: firestore.FieldValue.delete(),
            });
        }
      }

      const userRef = firestore().collection('users').doc(uid);
      await deleteSubcollections(userRef, [
        'movements', 'recurring', 'categories', 'savings', 'huchas', 'huchaMovements',
      ]);
      await userRef.delete();

      // Tokens push de este móvil y del resto de dispositivos.
      // Borrar `users/{uid}` NO arrastra sus subcolecciones, así que
      // 'devices' se quedaba huérfano para siempre y la Cloud Function
      // seguía teniendo a quién enviar notificaciones.
      // Va aquí, después de que lo demás haya salido bien: si el
      // borrado falla antes, la cuenta sigue viva y sus tokens también.
      try {
        await clearPushTokens(uid);
        await deleteSubcollections(userRef, ['devices']);
      } catch (e) {
        // No debe impedir que se complete el borrado de la cuenta
        reportError(e, 'deleteAccount: limpieza de devices');
      }

      try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch {}

      // Solo lo encolado por esta cuenta: en el mismo móvil puede
      // haber pendientes de otra persona y no son nuestras de borrar
      await clearQueueForUser(uid);

      await AsyncStorage.multiRemove([
        '@moflo_movements', '@moflo_recurring', '@moflo_settings',
        '@moflo_premium', '@moflo_custom_categories',
        '@moflo_shared_account', '@moflo_active_account', '@moflo_savings',
        '@moflo_daily_notif',
        // Faltaban: se quedaban en el móvil y la siguiente persona
        // que entrase veía un instante los datos de la cuenta borrada
        '@moflo_shared_movements', '@moflo_shared_recurring',
        '@moflo_huchas', '@moflo_shared_huchas',
        '@moflo_hucha_movements', '@moflo_shared_hucha_movements',
        `@moflo_hidden_base_${uid}`, `@moflo_reminders_${uid}`, `@moflo_shared_notif_${uid}`,
      ]);

      useMovementStore.getState().resetStore();
      useSettingsStore.getState().resetStore();
      usePremiumStore.getState().setPremium(false);
      useCategoryStore.getState().resetStore();
      useSharedAccountStore.getState().resetStore();
      useSavingsStore.getState().resetStore();
      useReminderStore.getState().resetStore();
      // Igual que al cerrar sesión: el SDK de compras no debe quedarse con la
      // identidad de una cuenta que ya no existe.
      await resetPurchasesUser();

      // Apple exige revocar el token de Sign in with Apple al borrar la cuenta.
      // Va justo antes de borrar el usuario porque Firebase lo asocia a la
      // sesión abierta. Nunca debe impedir el borrado: si falla (por ejemplo, si
      // la clave de Apple no está configurada en Firebase) o tarda, se registra
      // y se sigue.
      const revoke = revokeAppleToken().catch((e) => {
        reportError(e, 'deleteAccount: revocar token de Apple');
      });
      await Promise.race([revoke, new Promise<void>((resolve) => setTimeout(resolve, 10000))]);

      await auth().currentUser?.delete();
    } catch (e) {
      setIsDeleting(false);
      reportError(e, 'deleteAccount');
      Alert.alert(t('common.error'), t('settings.deleteAccountError'));
    }
  };

  // Paso previo obligatorio: verificar la identidad ANTES de borrar nada.
  // Si se cancela o falla, no se ha tocado un solo dato.
  const startAccountDeletion = async () => {
    if (isDeleting || isReauthenticating) return;

    if (needsPasswordToReauthenticate()) {
      setReauthPassword('');
      setReauthError('');
      setShowReauthModal(true);
      return;
    }

    setIsReauthenticating(true);
    const result = await reauthenticate();
    setIsReauthenticating(false);

    if (result === 'cancelled') return;
    if (result !== 'ok') {
      Alert.alert(t('common.error'), t('settings.reauthFailed'));
      return;
    }
    await performAccountDeletion();
  };

  const handleConfirmReauthPassword = async () => {
    if (isReauthenticating) return;
    if (!reauthPassword) {
      setReauthError(t('settings.reauthPasswordRequired'));
      return;
    }
    setIsReauthenticating(true);
    const result = await reauthenticate(reauthPassword);
    setIsReauthenticating(false);

    if (result === 'wrong-password') {
      setReauthError(t('settings.reauthWrongPassword'));
      return;
    }
    if (result !== 'ok') {
      setReauthError(t('settings.reauthFailed'));
      return;
    }

    setShowReauthModal(false);
    setReauthPassword('');
    setReauthError('');
    await performAccountDeletion();
  };

  const handleDeleteAccount = () => {
    warningHaptic();
    Alert.alert(
      t('settings.deleteAccount'),
      t('settings.deleteAccountWarning'),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        {
          text: t('settings.deleteAccount'),
          style: 'destructive',
          onPress: () => {
            warningHaptic();
            Alert.alert(
              t('settings.deleteAccountConfirm'),
              t('settings.deleteAccountConfirmMessage'),
              [
                { text: t('settings.cancel'), style: 'cancel' },
                {
                  text: t('settings.deleteAccount'),
                  style: 'destructive',
                  onPress: () => { startAccountDeletion(); },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    warningHaptic();
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
    } catch {
      Alert.alert(t('common.error'), t('sharedAccount.renameError'));
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

  // Tras salir de la cuenta compartida o borrarla hay que devolver también las
  // huchas a la cuenta personal, igual que hace el selector del header. Antes
  // solo se recargaban los movimientos: las huchas seguían apuntando a la
  // cuenta compartida y lo nuevo que se creaba lo rechazaban las reglas.
  const returnToPersonalAccount = async () => {
    useSavingsStore.getState().setSharedAccountId(null);
    await loadData();
    await setSharedMode(false);
    await useSavingsStore.getState().loadHuchas();
    navigation.navigate('HomeTab');
  };

  const handleLeave = () => {
    warningHaptic();
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
            await returnToPersonalAccount();
          },
        },
      ]
    );
  };

  const handleDeleteShared = () => {
    warningHaptic();
    Alert.alert(
      t('sharedAccount.deleteAccount'),
      t('sharedAccount.deleteWarning'),
      [
        { text: t('movements.cancel'), style: 'cancel' },
        {
          text: t('sharedAccount.exportFirst'),
          onPress: () => setExportMode('beforeDelete'),
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
    warningHaptic();
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
            await returnToPersonalAccount();
          },
        },
      ]
    );
  };

  const handleApproveRequest = (uid: string, name: string) => {
    Alert.alert(
      t('sharedAccount.approveConfirmTitle'),
      t('sharedAccount.approveConfirmBody', { name }),
      [
        { text: t('movements.cancel'), style: 'cancel' },
        {
          text: t('sharedAccount.approve'),
          onPress: () => { approveJoinRequest(uid).catch(() => {}); },
        },
      ]
    );
  };

  const handleRejectRequest = (uid: string, name: string) => {
    warningHaptic();
    Alert.alert(
      t('sharedAccount.rejectConfirmTitle'),
      t('sharedAccount.rejectConfirmBody', { name }),
      [
        { text: t('movements.cancel'), style: 'cancel' },
        {
          text: t('sharedAccount.reject'),
          style: 'destructive',
          onPress: () => { rejectJoinRequest(uid).catch(() => {}); },
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
      const iosUrl = 'https://apps.apple.com/app/id6762832281';
      const androidUrl = 'https://play.google.com/store/apps/details?id=com.oskartech.moflo';
      await Share.share({
        message: t('settings.shareAppMessage', { iosUrl, androidUrl }),
        title: t('settings.shareAppTitle'),
      });
    } catch {}
  };

  // Se exportan los datos de la cuenta activa (compartida o individual). En la
  // individual es una función premium; en la compartida, no
  const handleExportData = () => {
    if (isSharedMode) setExportMode('export');
    else requirePremium(() => setExportMode('export'));
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

  const currencyLabel = (code: string) =>
    (CURRENCIES.some(c => c.code === code) ? t(`settings.currencies.${code}`) : t('settings.currencies.EUR'));
  const CURRENCY_OPTIONS = CURRENCIES.map(c => ({
    code: c.code, badge: c.symbol, label: currencyName(t(`settings.currencies.${c.code}`)), detail: c.code,
  }));
  const LANGUAGE_OPTIONS = LANGUAGES.map(l => ({ code: l.code, label: l.label, badge: l.code.toUpperCase() }));
  const DATE_OPTIONS = DATE_FORMAT_OPTIONS.map(o => ({ ...o, detail: sampleDate(o.code) }));

  const selectedCurrencyLabel = currencyLabel(currencyCode);
  const selectedLanguageLabel = LANGUAGES.find(l => l.code === language)?.label ?? 'English';
  const selectedThemeLabel = THEME_OPTIONS.find(o => o.code === themeMode)?.label ?? t('settings.themeAuto');
  const selectedDateFormatLabel = DATE_FORMAT_OPTIONS.find(o => o.code === dateFormat)?.label ?? 'DD/MM/YYYY';
  const selectedPaletteId: ColorPaletteId = colorPalette && colorPalette in COLOR_PALETTES ? colorPalette : 'green';
  const selectedPaletteLabel = t(`settings.palette${selectedPaletteId.charAt(0).toUpperCase() + selectedPaletteId.slice(1)}`);

  const selectedSharedCurrencyLabel = currencyLabel(sharedCurrencyCode);
  const selectedSharedPaletteId: ColorPaletteId = sharedColorPalette && sharedColorPalette in COLOR_PALETTES ? sharedColorPalette : 'navy';
  const selectedSharedPaletteLabel = t(`settings.palette${selectedSharedPaletteId.charAt(0).toUpperCase() + selectedSharedPaletteId.slice(1)}`);
  const selectedSharedDateFormatLabel = DATE_FORMAT_OPTIONS.find(o => o.code === sharedDateFormat)?.label ?? 'DD/MM/YYYY';

  const individualSymbol = CURRENCIES.find(c => c.code === currencyCode)?.symbol ?? '€';
  const sharedSymbol = CURRENCIES.find(c => c.code === sharedCurrencyCode)?.symbol ?? '€';

  const initials = displayName
    ? displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0].toUpperCase() ?? '?';

  const isCreator = sharedAccount?.createdBy === uid;
  const kickableMembers = sharedAccount
    ? sharedAccount.members.filter(m => m !== sharedAccount.createdBy)
    : [];

  const switchProps = (value: boolean) => ({
    trackColor: { false: dc.border, true: dc.primary },
    thumbColor: '#FFFFFF',
    ios_backgroundColor: dc.border,
    value,
  });

  // ── CABECERA ──────────────────────────────────────────────────

  const hero = (
    <>
      <HeroTitleBar title={t('header.settings_screen')} onBack={goBack} />
      {!isSharedMode ? (
        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Text style={[styles.avatarText, { color: ui.hero }]}>{initials}</Text>
          </View>
          <View style={styles.profileInfo}>
            <TouchableOpacity
              style={styles.nameRow}
              onPress={() => setEditingName(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <Text style={[styles.profileName, { color: ui.onHero }]} numberOfLines={1}>
                {displayName || t('settings.displayName')}
              </Text>
              <Ionicons name="pencil-outline" size={15} color={ui.onHeroSoft} />
            </TouchableOpacity>
            <Text style={[styles.profileMeta, { color: ui.onHeroSoft }]} numberOfLines={1}>
              {user?.email ?? '—'}
            </Text>
            {isPremium && (
              <View style={[styles.heroChip, { backgroundColor: ui.heroFill }]}>
                <Ionicons name="star" size={12} color={ui.onHero} />
                <Text style={[styles.heroChipText, { color: ui.onHero }]}>{t('premium.title')}</Text>
              </View>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Ionicons name="people" size={28} color={ui.hero} />
          </View>
          <View style={styles.profileInfo}>
            <TouchableOpacity
              style={styles.nameRow}
              onPress={() => isCreator && setEditingSharedName(true)}
              activeOpacity={isCreator ? 0.7 : 1}
              disabled={!isCreator}
            >
              <Text style={[styles.profileName, { color: ui.onHero }]} numberOfLines={1}>
                {sharedAccount?.name ?? ''}
              </Text>
              {isCreator && <Ionicons name="pencil-outline" size={15} color={ui.onHeroSoft} />}
            </TouchableOpacity>
            <Text style={[styles.profileMeta, { color: ui.onHeroSoft }]} numberOfLines={1}>
              {t('sharedAccount.code')}: {sharedAccount?.inviteCode ?? ''}
            </Text>
            <View style={[styles.heroChip, { backgroundColor: ui.heroFill }]}>
              <Ionicons name="people-outline" size={12} color={ui.onHero} />
              <Text style={[styles.heroChipText, { color: ui.onHero }]}>
                {sharedAccount?.members.length ?? 0} {t('sharedAccount.members').toLowerCase()}
              </Text>
            </View>
          </View>
        </View>
      )}
    </>
  );

  // Sección Aplicación: igual en ambos modos
  const appSection = (
    <SettingsSection title={t('settings.appSection')}>
      <SettingsRow
        icon="compass-outline"
        label={t('walkthrough.settingsLabel')} subtitle={t('walkthrough.settingsSubtitle')}
        onPress={() => {
          navigation.navigate('HomeTab' as never);
          setTimeout(() => useWalkthroughStore.getState().start(), 250);
        }}
      />
      <SettingsRow
        icon="star-outline"
        label={t('settings.rateApp')} subtitle={t('settings.rateAppSubtitle')}
        onPress={handleRateApp}
      />
      <SettingsRow
        icon="share-social-outline"
        label={t('settings.shareApp')} subtitle={t('settings.shareAppSubtitle')}
        onPress={handleShare}
      />
      <SettingsRow
        icon="download-outline"
        label={t('export.title')}
        subtitle={!isSharedMode && !isPremium
          ? `⭐ ${t('premium.badge')}`
          : t(isSharedMode ? 'sharedAccount.exportSubtitle' : 'settings.individualExportSubtitle')}
        onPress={handleExportData}
      />
      {/* Apariencia: afecta a toda la app, no a la cuenta activa */}
      <SettingsRow
        icon="moon-outline"
        label={t('settings.theme')} value={selectedThemeLabel}
        onPress={() => setShowThemeModal(true)}
      />
      {/* Liquid Glass: solo en iOS 26 o posterior. Desactivado, la barra de abajo
          es sólida, igual que en Android */}
      {LIQUID_GLASS_AVAILABLE && (
        <SettingsRow
          icon="water-outline"
          label={t('settings.liquidGlass')}
          subtitle={t('settings.liquidGlassSubtitle')}
          right={
            <Switch
              {...switchProps(liquidGlassEnabled)}
              onValueChange={(value) => saveSettings({ liquidGlassEnabled: value })}
            />
          }
        />
      )}
      {/* Fuente: preferencia personal, también visible en la cuenta compartida */}
      <SettingsRow
        icon="text-outline"
        label={t('settings.font')}
        value={FONT_OPTIONS.find(f => f.id === selectedFont)?.label}
        onPress={() => setShowFontModal(true)}
      />
      {/* Vibración: ajuste de la app, independiente de la cuenta activa */}
      <SettingsRow
        icon="phone-portrait-outline"
        label={t('settings.haptics')}
        subtitle={t('settings.hapticsSubtitle')}
        right={
          <Switch
            {...switchProps(hapticsEnabled)}
            onValueChange={(value) => {
              saveSettings({ hapticsEnabled: value });
              // Al activarlo se confirma con la propia vibración
              if (value) lightHaptic();
            }}
          />
        }
      />
      <SettingsRow
        icon="chatbubble-outline"
        label={t('settings.support')} subtitle={t('settings.supportSubtitle')}
        onPress={() => navigation.navigate('Support')}
      />
    </SettingsSection>
  );

  const infoSection = (
    <SettingsSection title="Info">
      <SettingsRow
        icon="information-circle-outline"
        label={t('settings.version')} value={`v${appVersion}`}
      />
      <SettingsRow
        icon="document-text-outline"
        label={t('settings.privacyPolicy')}
        onPress={() => Linking.openURL('https://oskartech.github.io/privacy.html')}
      />
      <SettingsRow
        icon="shield-checkmark-outline"
        label={t('settings.termsOfService')}
        onPress={() => Linking.openURL('https://oskartech.github.io/terms.html')}
      />
    </SettingsSection>
  );

  return (
    <>
      <HeroScrollScreen hero={hero} keyboardShouldPersistTaps="handled">
        {!isSharedMode ? (
          <>
            {/* Premium o cuenta compartida */}
            {!isPremium ? (
              <TouchableOpacity
                style={[styles.upgrade, { backgroundColor: withAlpha(dc.savings, 0.12) }]}
                onPress={() => setShowModal(true)}
                activeOpacity={0.8}
              >
                <View style={[styles.upgradeIcon, { backgroundColor: ui.savingsText }]}>
                  <Ionicons name="star" size={18} color="#FFFFFF" />
                </View>
                <View style={styles.upgradeText}>
                  <Text style={[styles.upgradeTitle, { color: dc.textPrimary }]}>{t('premium.title')}</Text>
                  <Text style={[styles.upgradeSubtitle, { color: dc.textSecondary }]}>2,99€</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={ui.savingsText} />
              </TouchableOpacity>
            ) : (
              <SettingsSection title={t('sharedAccount.title')}>
                <SettingsRow
                  icon="people-outline"
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
              </SettingsSection>
            )}

            <SettingsSection title={t('settings.preferences')}>
              <SettingsRow
                icon="cash-outline"
                label={t('settings.currency')} value={selectedCurrencyLabel}
                onPress={() => setShowCurrencyModal(true)}
              />
              <SettingsRow
                icon="language-outline"
                label={t('settings.language')} value={selectedLanguageLabel}
                onPress={() => setShowLanguageModal(true)}
              />
              <SettingsRow
                icon="calendar-outline"
                label={t('settings.dateFormat')} value={selectedDateFormatLabel}
                onPress={() => setShowDateFormatModal(true)}
              />
              <SettingsRow
                icon="color-palette-outline"
                label={t('settings.colorPalette')}
                subtitle={!isPremium ? `⭐ ${t('premium.badge')}` : undefined}
                value={isPremium ? selectedPaletteLabel : undefined}
                swatch={isPremium ? COLOR_PALETTES[selectedPaletteId].primary : undefined}
                onPress={() => requirePremium(() => setShowColorPaletteModal(true))}
              />
              <SettingsRow
                icon="pricetag-outline"
                label={t('categories.title')}
                subtitle={!isPremium
                  ? `⭐ ${t('premium.badge')}`
                  : t('settings.individualCategoriesSubtitle')}
                onPress={() => requirePremium(() => navigation.navigate('Categories'))}
              />
              <SettingsRow
                icon="notifications-outline"
                label={t('settings.notifMovements')}
                subtitle={t('settings.notifMovementsSubtitle')}
                right={<Switch {...switchProps(dailyNotifEnabled)} onValueChange={handleDailyNotif} />}
              />
            </SettingsSection>

            {appSection}

            <SettingsSection title={t('settings.accountSection')}>
              <SettingsRow
                icon="trash-outline" danger
                label={t('settings.deleteData')} subtitle={t('settings.deleteDataSubtitle')}
                onPress={handleDeleteData}
              />
              <SettingsRow
                icon="person-remove-outline" danger
                label={t('settings.deleteAccount')} subtitle={t('settings.deleteAccountSubtitle')}
                onPress={isDeleting ? undefined : handleDeleteAccount}
              />
              <SettingsRow
                icon="log-out-outline" danger
                label={t('settings.logout')}
                onPress={handleLogout}
              />
            </SettingsSection>
          </>
        ) : (
          <>
            {/* Enlace de invitación */}
            <SettingsSection title={t('sharedAccount.inviteLink')}>
              <View style={[styles.invite, { backgroundColor: ui.field }]}>
                <Text style={[styles.inviteInfo, { color: dc.textSecondary }]}>
                  {t('sharedAccount.inviteInfo')}
                </Text>
                <Text style={[styles.linkText, { color: dc.textPrimary }]} numberOfLines={2}>
                  {getInviteLink()}
                </Text>
                <View style={styles.linkButtons}>
                  <TouchableOpacity
                    style={[styles.linkBtn, { backgroundColor: linkCopied ? withAlpha(ui.incomeText, 0.14) : ui.sheet }]}
                    onPress={handleCopyLink}
                  >
                    <Ionicons
                      name={linkCopied ? 'checkmark-circle' : 'copy-outline'}
                      size={16}
                      color={linkCopied ? ui.incomeText : ui.accent}
                    />
                    <Text style={[styles.linkBtnText, { color: linkCopied ? ui.incomeText : ui.accent }]}>
                      {linkCopied ? t('sharedAccount.linkCopied') : t('sharedAccount.copyLink')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.linkBtn, { backgroundColor: ui.sheet }]}
                    onPress={handleShareLink}
                  >
                    <Ionicons name="share-social-outline" size={16} color={ui.accent} />
                    <Text style={[styles.linkBtnText, { color: ui.accent }]}>
                      {t('sharedAccount.shareLink')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </SettingsSection>

            {/* Solicitudes pendientes (solo creador) */}
            {isCreator && visibleRequests.length > 0 && (
              <SettingsSection title={`${t('sharedAccount.pendingRequests')} (${visibleRequests.length})`}>
                {visibleRequests.map((req) => (
                  <View key={req.uid}>
                    <View style={styles.memberRow}>
                      <View style={[styles.memberAvatar, { backgroundColor: withAlpha(ui.savingsText, 0.15) }]}>
                        <Text style={[styles.memberInitial, { color: ui.savingsText }]}>
                          {req.displayName[0]?.toUpperCase() ?? '?'}
                        </Text>
                      </View>
                      <View style={styles.memberInfo}>
                        <Text style={[styles.memberName, { color: dc.textPrimary }]}>{req.displayName}</Text>
                        <Text style={[styles.memberRole, { color: dc.textSecondary }]}>
                          {t('sharedAccount.wantsToJoin')}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.requestActions}>
                      <TouchableOpacity
                        style={[styles.requestBtn, { backgroundColor: ui.expenseSoft }]}
                        onPress={() => handleRejectRequest(req.uid, req.displayName)}
                      >
                        <Ionicons name="close" size={16} color={ui.expenseText} />
                        <Text style={[styles.requestBtnText, { color: ui.expenseText }]}>
                          {t('sharedAccount.reject')}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.requestBtn, { backgroundColor: withAlpha(ui.incomeText, 0.14) }]}
                        onPress={() => handleApproveRequest(req.uid, req.displayName)}
                      >
                        <Ionicons name="checkmark" size={16} color={ui.incomeText} />
                        <Text style={[styles.requestBtnText, { color: ui.incomeText }]}>
                          {t('sharedAccount.approve')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </SettingsSection>
            )}

            {/* Miembros */}
            <SettingsSection title={`${t('sharedAccount.members')} (${sharedAccount?.members.length ?? 0})`}>
              {sharedAccount?.members.map((memberId) => {
                const name = sharedAccount.memberNames[memberId] ?? t('common.user');
                const isMe = memberId === uid;
                const isMemberCreator = memberId === sharedAccount.createdBy;
                return (
                  <View key={memberId} style={styles.memberRow}>
                    <View style={[styles.memberAvatar, { backgroundColor: ui.accentSoft }]}>
                      <Text style={[styles.memberInitial, { color: ui.accent }]}>
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
                );
              })}
            </SettingsSection>

            <SettingsSection title={t('settings.preferences')}>
              <SettingsRow
                icon="cash-outline"
                label={t('settings.currency')} value={selectedSharedCurrencyLabel}
                onPress={() => setShowSharedCurrencyModal(true)}
              />
              <SettingsRow
                icon="calendar-outline"
                label={t('settings.dateFormat')} value={selectedSharedDateFormatLabel}
                onPress={() => setShowSharedDateFormatModal(true)}
              />
              <SettingsRow
                icon="color-palette-outline"
                label={t('settings.colorPalette')}
                value={selectedSharedPaletteLabel}
                swatch={COLOR_PALETTES[selectedSharedPaletteId].primary}
                onPress={() => setShowSharedColorPaletteModal(true)}
              />
              <SettingsRow
                icon="pricetag-outline"
                label={t('categories.title')}
                subtitle={t('sharedAccount.sharedCategoriesSubtitle')}
                onPress={() => sharedAccount && navigation.navigate('SharedCategories', { accountId: sharedAccount.id })}
              />
              <SettingsRow
                icon="notifications-outline"
                label={t('sharedAccount.notifTitle')}
                subtitle={t('sharedAccount.notifSubtitle')}
                right={<Switch {...switchProps(notificationsEnabled)} onValueChange={setNotificationsEnabled} />}
              />
            </SettingsSection>

            {appSection}

            <SettingsSection title={t('settings.accountSection')}>
              {isCreator && (
                <SettingsRow
                  icon="pencil-outline"
                  label={t('sharedAccount.renameAccount')}
                  onPress={() => setEditingSharedName(true)}
                />
              )}
              {isCreator && kickableMembers.length > 0 && (
                <SettingsRow
                  icon="person-remove-outline" danger
                  label={t('sharedAccount.kickMember')}
                  onPress={handleKickMember}
                />
              )}
              {!isCreator && (
                <SettingsRow
                  icon="exit-outline" danger
                  label={t('sharedAccount.leaveAccount')}
                  onPress={handleLeave}
                />
              )}
              {isCreator && (
                <SettingsRow
                  icon="trash-outline" danger
                  label={t('sharedAccount.deleteAccount')}
                  subtitle={t('sharedAccount.deleteAccountSubtitle')}
                  onPress={handleDeleteShared}
                />
              )}
              <SettingsRow
                icon="log-out-outline" danger
                label={t('settings.logout')}
                onPress={handleLogout}
              />
            </SettingsSection>
          </>
        )}

        {infoSection}

        <Text style={[styles.footer, { color: dc.textSecondary }]}>
          {t('settings.madeWith')}
        </Text>
      </HeroScrollScreen>

      {/* ── NOMBRES ──────────────────────────────────────────── */}
      <BottomSheet
        visible={editingName}
        onClose={() => { setEditingName(false); setNameInput(displayName ?? ''); }}
        title={t('settings.displayName')}
        footer={<SheetButton label={t('settings.save')} onPress={handleSaveName} disabled={!nameInput.trim()} />}
      >
        <FilledInput
          icon="person-outline"
          value={nameInput}
          onChangeText={setNameInput}
          autoFocus
          maxLength={40}
          onSubmitEditing={handleSaveName}
          returnKeyType="done"
        />
      </BottomSheet>
      <BottomSheet
        visible={editingSharedName && isCreator}
        onClose={() => { setEditingSharedName(false); setNewSharedName(sharedAccount?.name ?? ''); }}
        title={t('sharedAccount.renameAccount')}
        footer={<SheetButton label={t('settings.save')} onPress={handleRenameAccount} disabled={!newSharedName.trim()} />}
      >
        <FilledInput
          icon="people-outline"
          value={newSharedName}
          onChangeText={setNewSharedName}
          autoFocus
          maxLength={40}
          onSubmitEditing={handleRenameAccount}
          returnKeyType="done"
        />
      </BottomSheet>

      {/* ── MODALES INDIVIDUALES ─────────────────────────────── */}
      <OptionSheet
        visible={showCurrencyModal}
        title={t('settings.currency')}
        subtitle={t('settings.currencyHint')}
        options={CURRENCY_OPTIONS}
        selected={currencyCode}
        onSelect={code => saveSettings({ currencyCode: code })}
        onDismiss={() => setShowCurrencyModal(false)}
      />
      <OptionSheet
        visible={showLanguageModal}
        title={t('settings.language')}
        options={LANGUAGE_OPTIONS}
        selected={language}
        onSelect={async (code) => {
          await saveSettings({ language: code });
          if (dailyNotifEnabled) {
            // Reprograma solo la diaria con el nuevo idioma (sin cancelar los recordatorios)
            await scheduleDailyNotification(i18n.t('settings.notifMovementsSubtitle'));
          }
        }}
        onDismiss={() => setShowLanguageModal(false)}
      />
      <AppearanceSheet
        visible={showThemeModal}
        paletteId={isSharedMode ? selectedSharedPaletteId : selectedPaletteId}
        selected={themeMode}
        onSelect={code => saveSettings({ themeMode: code })}
        onDismiss={() => setShowThemeModal(false)}
      />
      <OptionSheet
        visible={showDateFormatModal}
        title={t('settings.dateFormat')}
        options={DATE_OPTIONS}
        selected={dateFormat}
        onSelect={code => saveSettings({ dateFormat: code as DateFormat })}
        onDismiss={() => setShowDateFormatModal(false)}
      />
      <ExportDataModal
        visible={exportMode !== null}
        onClose={() => setExportMode(null)}
        onExported={exportMode === 'beforeDelete' ? confirmDeleteShared : undefined}
      />
      <ColorPaletteModal
        visible={showColorPaletteModal}
        selectedPalette={selectedPaletteId}
        currencySymbol={individualSymbol}
        onSelect={(id) => saveSettings({ colorPalette: id })}
        onDismiss={() => setShowColorPaletteModal(false)}
      />
      <FontSheet
        visible={showFontModal}
        selected={selectedFont}
        currencySymbol={isSharedMode ? sharedSymbol : individualSymbol}
        onSelect={async (id: AppFontId) => {
          setSelectedFont(id);
          await saveFont(id).catch((e) => console.error('Error saving font:', e));
          // La fuente se carga al arrancar: hay que reiniciar para verla.
          // Con retardo para que iOS muestre el aviso cuando la hoja ya se ha cerrado.
          if (id !== getActiveFont()) {
            setTimeout(() => {
              Alert.alert(t('settings.fontRestartTitle'), t('settings.fontRestartMessage'), [
                { text: t('settings.fontRestartOk'), style: 'cancel' },
                {
                  text: t('settings.fontRestartNow'),
                  onPress: () => {
                    reloadAppAsync('Font changed').catch((e) =>
                      console.error('Error reloading app:', e)
                    );
                  },
                },
              ]);
            }, 400);
          }
        }}
        onDismiss={() => setShowFontModal(false)}
      />

      {/* ── MODALES COMPARTIDOS ──────────────────────────────── */}
      <OptionSheet
        visible={showSharedCurrencyModal}
        title={t('settings.currency')}
        subtitle={t('settings.currencyHintShared')}
        options={CURRENCY_OPTIONS}
        selected={sharedCurrencyCode}
        onSelect={code => sharedAccount && saveSharedSettings(sharedAccount.id, { currencyCode: code })}
        onDismiss={() => setShowSharedCurrencyModal(false)}
      />
      <OptionSheet
        visible={showSharedDateFormatModal}
        title={t('settings.dateFormat')}
        options={DATE_OPTIONS}
        selected={sharedDateFormat}
        onSelect={code => sharedAccount && saveSharedSettings(sharedAccount.id, { dateFormat: code })}
        onDismiss={() => setShowSharedDateFormatModal(false)}
      />
      <ColorPaletteModal
        visible={showSharedColorPaletteModal}
        selectedPalette={selectedSharedPaletteId}
        currencySymbol={sharedSymbol}
        onSelect={(id) => sharedAccount && saveSharedSettings(sharedAccount.id, { colorPalette: id })}
        onDismiss={() => setShowSharedColorPaletteModal(false)}
      />

      {/* ── EXPULSAR MIEMBRO ─────────────────────────────────── */}
      <BottomSheet
        visible={showKickMemberModal}
        onClose={() => setShowKickMemberModal(false)}
        title={t('sharedAccount.kickMember')}
        bodyStyle={styles.sheetList}
      >
        {kickableMembers.map((memberId) => {
          const name = sharedAccount?.memberNames?.[memberId] ?? t('common.user');
          return (
            <TouchableOpacity
              key={memberId}
              style={styles.kickRow}
              onPress={() => {
                setShowKickMemberModal(false);
                warningHaptic();
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
                        try {
                          // Solo se quita a ese miembro, sin reescribir la
                          // lista entera con la copia local. Su nombre se
                          // queda: lo que añadió sigue firmado, tachado.
                          await firestore()
                            .collection('sharedAccounts')
                            .doc(sharedAccount.id)
                            .update({
                              members: firestore.FieldValue.arrayRemove(memberId),
                            });
                          Alert.alert('✅', t('sharedAccount.kickSuccess'));
                        } catch (e) {
                          // Antes un fallo no enseñaba nada: solo faltaba el ✅
                          reportError(e, 'kickMember');
                          Alert.alert(t('common.error'), t('auth.errorGeneral'));
                        }
                      },
                    },
                  ]
                );
              }}
            >
              <View style={[styles.memberAvatar, { backgroundColor: ui.accentSoft }]}>
                <Text style={[styles.memberInitial, { color: ui.accent }]}>
                  {name[0].toUpperCase()}
                </Text>
              </View>
              <Text style={[styles.memberName, styles.memberInfo, { color: dc.textPrimary }]}>{name}</Text>
              <Ionicons name="person-remove-outline" size={18} color={ui.expenseText} />
            </TouchableOpacity>
          );
        })}
      </BottomSheet>

      {/* Confirmación de identidad antes de borrar la cuenta. Solo aparece en
          cuentas de correo y contraseña: Apple y Google abren su propia hoja. */}
      <BottomSheet
        visible={showReauthModal}
        onClose={() => { if (!isReauthenticating) setShowReauthModal(false); }}
        title={t('settings.reauthTitle')}
        subtitle={t('settings.reauthMessage')}
        footer={(
          <SheetButton
            label={isReauthenticating ? t('settings.reauthChecking') : t('settings.deleteAccount')}
            onPress={handleConfirmReauthPassword}
            loading={isReauthenticating}
            variant="danger"
          />
        )}
      >
        <FilledInput
          icon="lock-closed-outline"
          value={reauthPassword}
          onChangeText={(v) => { setReauthPassword(v); setReauthError(''); }}
          placeholder={t('settings.reauthPassword')}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          onSubmitEditing={handleConfirmReauthPassword}
        />
        {!!reauthError && (
          <Text style={[styles.reauthError, { color: ui.expenseText }]}>{reauthError}</Text>
        )}
      </BottomSheet>

      <PremiumModal
        visible={showModal}
        onDismiss={() => setShowModal(false)}
        onPurchase={() => setShowModal(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  // Cabecera
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 14 },
  avatar: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFFFFF',
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  avatarText: { fontSize: 23, fontFamily: 'Poppins_700Bold' },
  profileInfo: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', maxWidth: '100%' },
  profileName: { fontSize: 21, fontFamily: 'Poppins_700Bold', letterSpacing: -0.3, flexShrink: 1 },
  profileMeta: { fontSize: 13, fontFamily: 'Poppins_400Regular', marginTop: 1 },
  heroChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginTop: 8,
  },
  heroChipText: { fontSize: 11.5, fontFamily: 'Poppins_600SemiBold' },

  // Premium
  upgrade: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 20, marginBottom: 22, borderRadius: 18, padding: 14,
  },
  upgradeIcon: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  upgradeText: { flex: 1 },
  upgradeTitle: { fontSize: 16, fontFamily: 'Poppins_700Bold' },
  upgradeSubtitle: { fontSize: 13, fontFamily: 'Poppins_400Regular', marginTop: 1 },

  // Enlace de invitación
  invite: { borderRadius: 18, padding: 14, marginTop: 8 },
  inviteInfo: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginBottom: 6 },
  linkText: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginBottom: 12, lineHeight: 18 },
  linkButtons: { flexDirection: 'row', gap: 8 },
  linkBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, padding: 10, borderRadius: 12,
  },
  linkBtnText: { fontSize: 12.5, fontFamily: 'Poppins_600SemiBold' },

  // Miembros y solicitudes
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  memberAvatar: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  memberInitial: { fontSize: 15, fontFamily: 'Poppins_700Bold' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontFamily: 'Poppins_500Medium' },
  memberRole: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 1 },
  requestActions: { flexDirection: 'row', gap: 8, paddingBottom: 10, paddingLeft: 46 },
  requestBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, padding: 10, borderRadius: 12,
  },
  requestBtnText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },

  footer: { textAlign: 'center', fontSize: 13, fontFamily: 'Poppins_400Regular', marginTop: 4, marginBottom: 8 },

  // Ventanas
  sheetList: { paddingBottom: 8 },
  kickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  reauthError: { fontSize: 13, fontFamily: 'Poppins_400Regular', marginTop: 8 },
});

export default SettingsScreen;
