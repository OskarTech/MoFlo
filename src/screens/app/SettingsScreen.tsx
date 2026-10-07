import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Alert, Linking, Share,
  Switch, Platform, Clipboard, BackHandler, ActivityIndicator,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import Icon from '../../components/common/Icon';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as StoreReview from 'expo-store-review';
import * as Notifications from 'expo-notifications';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import { useTheme } from '../../hooks/useTheme';
import { useSettingsStore, CURRENCIES, LANGUAGES, ThemeMode, DateFormat } from '../../store/settingsStore';
import { COLOR_PALETTES, ColorPaletteId } from '../../theme';
import { useMovementStore } from '../../store/movementStore';
import { useSavingsStore } from '../../store/savingsStore';
import { usePremium } from '../../hooks/usePremium';
import { usePremiumPrice } from '../../hooks/usePremiumPrice';
import { usePremiumStore } from '../../store/premiumStore';
import { useCategoryStore } from '../../store/categoryStore';
import { useSharedAccountStore } from '../../store/sharedAccountStore';
import { switchToShared, switchToIndividual } from '../../store/accountSwitch';
import { removeSharedCaches } from '../../store/sharedCache';
import { deleteInviteCode } from '../../store/inviteCodes';
import { useReminderStore } from '../../store/reminderStore';
import { useWalkthroughStore } from '../../store/walkthroughStore';
import PremiumModal from '../../components/common/PremiumModal';
import ColorPaletteModal from '../../components/common/ColorPaletteModal';
import BottomSheet, { SheetButton, FilledInput } from '../../components/common/BottomSheet';
import { HeroScrollScreen } from '../../components/layout/HeroScreen';
import { HeroTitleBar } from '../../components/layout/HeroBar';
import { getTabBeforeSettings } from '../../navigation/navigationRef';
import { SettingsSection, SettingsRow } from '../../components/settings/SettingsRows';
import { OptionSheet, AppearanceSheet, FontSheet, MonthStartSheet } from '../../components/settings/SettingsSheets';
import i18n from '../../i18n';
import { logout } from '../../services/firebase/auth.service';
import { checkCloudCopy } from '../../store/checkCloudCopy';
import { useCloudCheckStore, lastFullCheck, selectLastFullCheck, removeCloudChecks } from '../../store/cloudCheck';
import { removeBusinessOnAccountDeletion } from '../../business/cleanup';
import { clearPushTokens } from '../../services/firebase/pushTokens.service';
import { clearQueueForUser, clearPersonalQueueForUser, hasUnsyncedChanges } from '../../services/syncQueue.service';
import { revokeAppleToken } from '../../services/firebase/appleAuth';
import { reportError } from '../../services/crashReporting';
import { resetPurchasesUser } from '../../services/revenuecat';
import { deleteSubcollections } from '../../services/firebase/batchDelete';
import { reauthenticate, needsPasswordToReauthenticate } from '../../services/firebase/reauth.service';
import ExportDataModal from '../../components/common/ExportDataModal';
import {
  scheduleDailyNotification, cancelDailyNotification, getDailyNotificationTime, DailyTime,
} from '../../services/notifications.service';
import Constants from 'expo-constants';
import { reloadAppAsync } from 'expo';
import { lightHaptic, successHaptic, warningHaptic } from '../../utils/haptics';
import { getMemberPhoto } from '../../utils/memberLabel';
import { normalizeStartDay } from '../../utils/period';
import Avatar from '../../components/common/Avatar';
import {
  PHOTOS_AVAILABLE, pickPhoto, deletePhotos, userPhotoFolder, sharedPhotoFolder,
} from '../../services/firebase/photo.service';
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

// Hoy a la hora del recordatorio diario, para el selector
const dailyTimeDate = ({ hour, minute }: DailyTime) => {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
};

// Como en Recordatorios: 12 h en inglés, 24 h en el resto
const formatDailyTime = (time: DailyTime) => (i18n.language === 'en'
  ? dailyTimeDate(time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  : `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`);

const SettingsScreen = () => {
  const { t } = useTranslation();
  const { isDark, colors: dc, ui } = useTheme();
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
    displayName, currencyCode, language, themeMode, dateFormat, colorPalette, hapticsEnabled,
    photoURL, monthStartDay, saveSettings, setProfilePhoto,
  } = useSettingsStore();
  const { isPremium, showModal, setShowModal, requirePremium } = usePremium();
  const premiumPrice = usePremiumPrice(!isPremium);
  const {
    isSharedMode, sharedAccount, notificationsEnabled,
    setNotificationsEnabled, leaveSharedAccount, deleteSharedAccount,
    getInviteLink, sharedCurrencyCode, sharedColorPalette,
    sharedDateFormat, sharedMonthStartDay, saveSharedSettings,
    incomingRequests, approveJoinRequest, rejectJoinRequest,
    setSharedAccountPhoto,
  } = useSharedAccountStore();
  const visibleRequests = incomingRequests.filter(r => r.status === 'pending');

  const user = auth().currentUser;
  const uid = user?.uid;
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  // Copia en la nube de la cuenta activa: cuándo se comprobó entera por última vez
  const cloudScope = isSharedMode && sharedAccount ? sharedAccount.id : uid ?? null;
  const cloudCheckedAt = useCloudCheckStore((s) => (cloudScope ? selectLastFullCheck(s.checkedAt, cloudScope) : null));
  const [checkingCloud, setCheckingCloud] = useState(false);
  useEffect(() => {
    if (cloudScope) lastFullCheck(cloudScope).catch(() => {});
  }, [cloudScope]);

  // Individual state
  const [isDeleting, setIsDeleting] = useState(false);
  // Reautenticación previa al borrado de cuenta. Solo las cuentas de correo y
  // contraseña necesitan el modal: Apple y Google abren su propia hoja.
  const [showReauthModal, setShowReauthModal] = useState(false);
  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthError, setReauthError] = useState('');
  const [isReauthenticating, setIsReauthenticating] = useState(false);
  const [dailyNotifEnabled, setDailyNotifEnabled] = useState(false);
  const [dailyTime, setDailyTime] = useState<DailyTime>({ hour: 20, minute: 0 });
  // Eligiendo la hora al activarlo: el interruptor ya sale encendido
  const [enablingDaily, setEnablingDaily] = useState(false);
  // iOS: la hoja con el selector de hora y la hora que marca
  const [showDailyTimeSheet, setShowDailyTimeSheet] = useState(false);
  const [dailyTimeDraft, setDailyTimeDraft] = useState(new Date());
  const dailyTimeToSave = useRef<{ date: Date; enabling: boolean } | null>(null);
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showDateFormatModal, setShowDateFormatModal] = useState(false);
  const [showMonthStartSheet, setShowMonthStartSheet] = useState(false);
  const [showColorPaletteModal, setShowColorPaletteModal] = useState(false);
  const [showFontModal, setShowFontModal] = useState(false);
  // Elegir formato de exportación; 'beforeDelete': al terminar sigue con el borrado de la cuenta compartida
  const [exportMode, setExportMode] = useState<null | 'export' | 'beforeDelete'>(null);
  const [selectedFont, setSelectedFont] = useState<AppFontId>(getActiveFont());
  const [editingName, setEditingName] = useState(false);
  // Subiendo o quitando una foto
  const [photoBusy, setPhotoBusy] = useState(false);

  // La fuente guardada puede no ser la activa si aún no se ha reiniciado la app
  useEffect(() => {
    getSavedFont().then(setSelectedFont);
  }, []);
  const [nameInput, setNameInput] = useState(displayName ?? '');

  // Shared state
  const [linkCopied, setLinkCopied] = useState(false);
  const [showInviteSheet, setShowInviteSheet] = useState(false);
  const [editingSharedName, setEditingSharedName] = useState(false);
  const [newSharedName, setNewSharedName] = useState(sharedAccount?.name ?? '');
  const [showSharedCurrencyModal, setShowSharedCurrencyModal] = useState(false);
  const [showSharedDateFormatModal, setShowSharedDateFormatModal] = useState(false);
  const [showSharedMonthStartSheet, setShowSharedMonthStartSheet] = useState(false);
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
    setDailyTime(await getDailyNotificationTime());
  };

  // ── FOTOS (perfil y cuenta compartida) ────────────────────────

  const savePhoto = async (target: 'profile' | 'shared', localUri: string | null) => {
    setPhotoBusy(true);
    try {
      if (target === 'shared') await setSharedAccountPhoto(localUri);
      else await setProfilePhoto(localUri);
    } catch (e) {
      reportError(e, 'savePhoto');
      Alert.alert(t('common.error'), t('settings.photoError'));
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleChoosePhoto = async (target: 'profile' | 'shared') => {
    try {
      const localUri = await pickPhoto();
      if (localUri) await savePhoto(target, localUri);
    } catch (e) {
      reportError(e, 'pickPhoto');
      Alert.alert(t('common.error'), t('settings.photoError'));
    }
  };

  // Elegir otra de la galería o quitar la que hay
  const openPhotoMenu = (target: 'profile' | 'shared') => {
    if (photoBusy) return;
    const current = target === 'shared' ? sharedAccount?.photoURL : photoURL;
    Alert.alert(
      t(target === 'shared' ? 'settings.photoShared' : 'settings.photoProfile'),
      undefined,
      [
        { text: t('settings.photoChoose'), onPress: () => { handleChoosePhoto(target); } },
        ...(current
          ? [{ text: t('settings.photoRemove'), style: 'destructive' as const, onPress: () => { savePhoto(target, null); } }]
          : []),
        { text: t('settings.cancel'), style: 'cancel' as const },
      ],
    );
  };

  // ── INDIVIDUAL HANDLERS ───────────────────────────────────────

  // Las ventanas de nombre salen con el nombre guardado. Se repone al abrir y
  // no al cerrar: al cerrar, lo escrito cambiaba mientras la ventana bajaba
  const openNameSheet = () => {
    setNameInput(displayName ?? '');
    setEditingName(true);
  };

  const openSharedNameSheet = () => {
    setNewSharedName(sharedAccount?.name ?? '');
    setEditingSharedName(true);
  };

  const handleSaveName = async () => {
    if (!nameInput.trim()) return;
    await saveSettings({ displayName: nameInput.trim() });
    setEditingName(false);
  };

  // Al activarlo se pide el permiso y después la hora; se activa al elegirla
  const handleDailyNotif = async (enabled: boolean) => {
    if (!enabled) {
      setDailyNotifEnabled(false);
      await AsyncStorage.setItem(NOTIF_KEY, 'false');
      await cancelDailyNotification();
      return;
    }
    setEnablingDaily(true);
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      setEnablingDaily(false);
      Alert.alert(t('reminders.permissionDenied'), t('reminders.permissionDeniedMessage'));
      return;
    }
    askDailyTime(true);
  };

  // La hora del recordatorio: en Android, la ventana del sistema; en iOS, una
  // hoja con el selector. Si se cancela al activarlo, sigue desactivado
  const askDailyTime = (enabling: boolean) => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: dailyTimeDate(dailyTime),
        mode: 'time',
        is24Hour: i18n.language !== 'en',
        onChange: (event, date) => {
          if (event.type === 'set' && date) saveDailyTime(date, enabling);
          else if (enabling) setEnablingDaily(false);
        },
      });
      return;
    }
    setDailyTimeDraft(dailyTimeDate(dailyTime));
    setShowDailyTimeSheet(true);
  };

  const saveDailyTime = async (date: Date, enabling: boolean) => {
    const time = { hour: date.getHours(), minute: date.getMinutes() };
    setDailyTime(time);
    setDailyNotifEnabled(true);
    setEnablingDaily(false);
    await AsyncStorage.setItem(NOTIF_KEY, 'true');
    // Solo reprograma la diaria: cancelar todas borraría también los recordatorios
    await scheduleDailyNotification(t('settings.notifMovementsSubtitle'), time);
    if (enabling) Alert.alert('✅', t('settings.notifDailyEnabled', { time: formatDailyTime(time) }));
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
                  ['movements', 'recurring', 'huchas', 'huchaMovements', 'deletedMovements', 'deletedHuchaMovements'],
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
            'deletedMovements', 'deletedHuchaMovements',
          ]);
          // La foto de la cuenta, antes que el documento: Storage mira en él
          // quién es miembro
          await deletePhotos(sharedPhotoFolder(accountId)).catch((e) =>
            reportError(e, 'deleteAccount: foto de la cuenta compartida')
          );
          // Su código de invitación, también antes que la cuenta (ver inviteCodes)
          await deleteInviteCode(sa);
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
              [`memberPhotos.${uid}`]: firestore.FieldValue.delete(),
            });
        }
      }

      // La cuenta de empresa, como la compartida: la que creaste se borra
      // entera; de la de otro, sales. Nunca para el borrado
      await removeBusinessOnAccountDeletion(uid);

      const userRef = firestore().collection('users').doc(uid);
      await deleteSubcollections(userRef, [
        'movements', 'recurring', 'categories', 'savings', 'huchas', 'huchaMovements',
        'deletedMovements', 'deletedHuchaMovements',
      ]);
      // Su foto de perfil también es un dato suyo: se va con la cuenta
      await deletePhotos(userPhotoFolder(uid)).catch((e) =>
        reportError(e, 'deleteAccount: foto de perfil')
      );
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
      // Las copias de cada cuenta compartida van con su id en la clave
      await removeSharedCaches().catch(() => {});
      await removeCloudChecks().catch(() => {});

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
        { text: t('settings.logout'), style: 'destructive', onPress: confirmLogout },
      ]
    );
  };

  // Antes se intenta subir lo pendiente, y solo si queda algo (sin conexión)
  // se avisa: lo normal es que ya esté todo en la nube
  const confirmLogout = async () => {
    if (!(await hasUnsyncedChanges())) {
      logout();
      return;
    }
    warningHaptic();
    Alert.alert(
      t('settings.logoutPendingTitle'),
      t('settings.logoutPendingMessage'),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        { text: t('settings.logoutAnyway'), style: 'destructive', onPress: logout },
      ]
    );
  };

  // ── SHARED HANDLERS ───────────────────────────────────────────

  // Primero en la app y luego en Firestore, sin esperarlo: sin conexión, la
  // ventana no se cerraba ni cambiaba el nombre hasta recuperarla. Firestore
  // lo guarda y lo sube solo; si lo rechaza, vuelve el nombre de antes
  const handleRenameAccount = () => {
    const name = newSharedName.trim();
    if (!name || !sharedAccount) return;
    const previous = sharedAccount;
    const failed = () => {
      // Solo si sigue con el nombre que no se ha podido guardar
      const now = useSharedAccountStore.getState().sharedAccount;
      if (now?.id === previous.id && now.name === name) {
        useSharedAccountStore.setState({ sharedAccount: { ...now, name: previous.name } });
      }
      Alert.alert(t('common.error'), t('sharedAccount.renameError'));
    };
    useSharedAccountStore.setState({ sharedAccount: { ...previous, name } });
    setEditingSharedName(false);
    Alert.alert('✅', t('sharedAccount.renameSuccess'));
    try {
      firestore().collection('sharedAccounts').doc(previous.id).update({ name }).catch(failed);
    } catch {
      failed();
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

  // Salir de la cuenta compartida o borrarla, con la pantalla de carga: al
  // quitarla ya se está en Inicio con la cuenta individual entera (también sus
  // huchas: antes se quedaban apuntando a la compartida y lo nuevo lo
  // rechazaban las reglas). Sin conexión no se intenta: la pantalla esperaría
  // a que volviese. Si falla, se sigue en la compartida y se avisa
  const leaveToPersonalAccount = async (action: () => Promise<void>, context: string) => {
    const net = await NetInfo.fetch();
    if (net.isConnected === false) {
      Alert.alert(t('common.error'), t('accountSwitch.error'));
      return;
    }
    try {
      await switchToIndividual({ before: action, onArrive: () => navigation.navigate('HomeTab') });
    } catch (e) {
      reportError(e, context);
      Alert.alert(t('common.error'), t('accountSwitch.error'));
    }
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
          onPress: () => leaveToPersonalAccount(leaveSharedAccount, 'salir de la cuenta compartida'),
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
          onPress: () => leaveToPersonalAccount(deleteSharedAccount, 'borrar la cuenta compartida'),
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

  // Lo cambiado se sube solo; esto baja de la nube el historial entero de la
  // cuenta activa, como cada 14 días (ver cloudCheck)
  const handleCheckCloudCopy = async () => {
    if (checkingCloud) return;
    lightHaptic();
    setCheckingCloud(true);
    try {
      const result = await checkCloudCopy();
      if (result === 'done') {
        successHaptic();
      } else {
        Alert.alert(
          t('settings.cloudCopy'),
          t(result === 'offline' ? 'settings.cloudCopyOffline' : 'settings.cloudCopyError'),
        );
      }
    } finally {
      setCheckingCloud(false);
    }
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

  // Avatar de la cabecera. Con foto, tocándola se ve en grande, y la cámara de
  // al lado la cambia o la quita; sin foto, tocar el avatar ya abre el menú.
  // Con una build sin los módulos de fotos solo se puede ampliar
  const heroAvatar = (target: 'profile' | 'shared', uri: string | null | undefined, fallback: React.ReactNode) => {
    const title = target === 'shared' ? sharedAccount?.name ?? '' : displayName || t('common.user');
    const avatar = <Avatar uri={uri} style={styles.avatar} zoomTitle={title}>{fallback}</Avatar>;
    if (!PHOTOS_AVAILABLE) return avatar;
    const openMenu = () => openPhotoMenu(target);
    return (
      <View style={styles.avatarWrap}>
        {uri ? avatar : (
          <TouchableOpacity
            onPress={openMenu}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('settings.photoChange')}
          >
            {avatar}
          </TouchableOpacity>
        )}
        {photoBusy ? (
          <View style={[styles.avatar, styles.avatarBusy]}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.avatarEdit, { borderColor: ui.hero }]}
            onPress={openMenu}
            hitSlop={10}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('settings.photoChange')}
          >
            <Icon name="camera" size={12} color={ui.hero} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const hero = (
    <>
      <HeroTitleBar title={t('header.settings_screen')} onBack={goBack} />
      {!isSharedMode ? (
        <View style={styles.profile}>
          {heroAvatar('profile', photoURL, (
            <Text style={[styles.avatarText, { color: ui.hero }]}>{initials}</Text>
          ))}
          <View style={styles.profileInfo}>
            <TouchableOpacity
              style={styles.nameRow}
              onPress={openNameSheet}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <Text style={[styles.profileName, { color: ui.onHero }]} numberOfLines={1}>
                {displayName || t('settings.displayName')}
              </Text>
              <Icon name="pencil-outline" size={15} color={ui.onHeroSoft} />
            </TouchableOpacity>
            <Text style={[styles.profileMeta, { color: ui.onHeroSoft }]} numberOfLines={1}>
              {user?.email ?? '—'}
            </Text>
            {isPremium && (
              <View style={[styles.heroChip, { backgroundColor: ui.heroFill }]}>
                <Icon name="star" size={12} color={ui.onHero} />
                <Text style={[styles.heroChipText, { color: ui.onHero }]}>{t('premium.title')}</Text>
              </View>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.profile}>
          {heroAvatar('shared', sharedAccount?.photoURL, (
            <Icon name="people" size={28} color={ui.hero} />
          ))}
          <View style={styles.profileInfo}>
            <TouchableOpacity
              style={styles.nameRow}
              onPress={() => isCreator && openSharedNameSheet()}
              activeOpacity={isCreator ? 0.7 : 1}
              disabled={!isCreator}
            >
              <Text style={[styles.profileName, { color: ui.onHero }]} numberOfLines={1}>
                {sharedAccount?.name ?? ''}
              </Text>
              {isCreator && <Icon name="pencil-outline" size={15} color={ui.onHeroSoft} />}
            </TouchableOpacity>
            <Text style={[styles.profileMeta, { color: ui.onHeroSoft }]} numberOfLines={1}>
              {t('sharedAccount.code')}: {sharedAccount?.inviteCode ?? ''}
            </Text>
            <View style={[styles.heroChip, { backgroundColor: ui.heroFill }]}>
              <Icon name="people-outline" size={12} color={ui.onHero} />
              <Text style={[styles.heroChipText, { color: ui.onHero }]}>
                {t('sharedAccount.memberCount', { count: sharedAccount?.members.length ?? 0 })}
              </Text>
            </View>
          </View>
        </View>
      )}
    </>
  );

  // Exportar: los datos de la cuenta activa, por eso va en sus preferencias
  const exportRow = (
    <SettingsRow
      icon="download-outline"
      label={t('export.title')}
      subtitle={!isSharedMode && !isPremium
        ? `⭐ ${t('premium.badge')}`
        : t(isSharedMode ? 'sharedAccount.exportSubtitle' : 'settings.individualExportSubtitle')}
      onPress={handleExportData}
    />
  );

  const cloudCopySubtitle = (() => {
    if (cloudCheckedAt == null) return t('settings.cloudCopyAuto');
    const dayOf = (ms: number) => {
      const d = new Date(ms);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    };
    // Redondeado: con el cambio de hora un día dura 23 o 25 horas
    const days = Math.max(0, Math.round((dayOf(Date.now()) - dayOf(cloudCheckedAt)) / 86400000));
    return days === 0
      ? t('settings.cloudCopyCheckedToday')
      : t('settings.cloudCopyCheckedDaysAgo', { count: days });
  })();

  // Copia en la nube: la de la cuenta activa, en sus preferencias como exportar
  const cloudCopyRow = (
    <SettingsRow
      icon="cloud-check-duotone"
      label={t('settings.cloudCopy')}
      subtitle={cloudCopySubtitle}
      value={t(checkingCloud ? 'settings.cloudCopyChecking' : 'settings.cloudCopyCheck')}
      onPress={handleCheckCloudCopy}
    />
  );

  // Sección Aplicación: ajustes de toda la app, los mismos en la cuenta
  // individual y en la compartida
  const appSection = (
    <SettingsSection title={t('settings.appSection')}>
      {/* Apariencia: afecta a toda la app, no a la cuenta activa */}
      <SettingsRow
        icon="moon-outline"
        label={t('settings.theme')} value={selectedThemeLabel}
        onPress={() => setShowThemeModal(true)}
      />
      {/* Fuente: preferencia personal, también visible en la cuenta compartida.
          Cambiarla es de premium; quien ya eligió una la conserva */}
      <SettingsRow
        icon="text-outline"
        label={t('settings.font')}
        subtitle={!isPremium ? `⭐ ${t('premium.badge')}` : undefined}
        value={isPremium ? FONT_OPTIONS.find(f => f.id === selectedFont)?.label : undefined}
        onPress={() => requirePremium(() => setShowFontModal(true))}
      />
      <SettingsRow
        icon="language-outline"
        label={t('settings.language')} value={selectedLanguageLabel}
        onPress={() => setShowLanguageModal(true)}
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
      {/* Recordatorio diario: se programa en el móvil, sea cual sea la cuenta.
          Activado, tocando la fila se cambia la hora */}
      <SettingsRow
        icon="notifications-outline"
        label={t('settings.dailyReminder')}
        subtitle={dailyNotifEnabled
          ? t('settings.dailyReminderAt', { time: formatDailyTime(dailyTime) })
          : t('settings.dailyReminderSubtitle')}
        onPress={enablingDaily ? undefined
          : dailyNotifEnabled ? () => askDailyTime(false) : () => handleDailyNotif(true)}
        right={<Switch {...switchProps(dailyNotifEnabled || enablingDaily)} onValueChange={handleDailyNotif} />}
      />
      <SettingsRow
        icon="compass-outline"
        label={t('walkthrough.settingsLabel')} subtitle={t('walkthrough.settingsSubtitle')}
        onPress={() => {
          navigation.navigate('HomeTab' as never);
          setTimeout(() => useWalkthroughStore.getState().start(), 250);
        }}
      />
      <SettingsRow
        icon="share-social-outline"
        label={t('settings.shareApp')} subtitle={t('settings.shareAppSubtitle')}
        onPress={handleShare}
      />
      <SettingsRow
        icon="star-outline"
        label={t('settings.rateApp')} subtitle={t('settings.rateAppSubtitle')}
        onPress={handleRateApp}
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
                  <Icon name="star" size={18} color="#FFFFFF" />
                </View>
                <View style={styles.upgradeText}>
                  <Text style={[styles.upgradeTitle, { color: dc.textPrimary }]}>{t('premium.title')}</Text>
                  <Text style={[styles.upgradeSubtitle, { color: dc.textSecondary }]}>{premiumPrice}</Text>
                </View>
                <Icon name="chevron-forward" size={18} color={ui.savingsText} />
              </TouchableOpacity>
            ) : (
              <SettingsSection title={t('sharedAccount.title')}>
                <SettingsRow
                  icon="people-outline"
                  label={sharedAccount?.name ?? t('sharedAccount.title')}
                  subtitle={sharedAccount
                    ? t('sharedAccount.memberCount', { count: sharedAccount.members.length })
                    : t('sharedAccount.noAccount')}
                  onPress={() => {
                    if (sharedAccount) {
                      // Con la pantalla de carga, y a Inicio cuando ya está todo
                      switchToShared({ onArrive: () => navigation.navigate('HomeTab') })
                        .catch((e) => reportError(e, 'abrir cuenta compartida'));
                    } else {
                      navigation.navigate('SharedAccount');
                    }
                  }}
                />
              </SettingsSection>
            )}

            {/* Cómo se personaliza la cuenta individual */}
            <SettingsSection title={t('settings.individualPreferences')}>
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
                icon="coins-duotone"
                label={t('settings.currency')} value={selectedCurrencyLabel}
                onPress={() => setShowCurrencyModal(true)}
              />
              <SettingsRow
                icon="calendar-outline"
                label={t('settings.dateFormat')} value={selectedDateFormatLabel}
                onPress={() => setShowDateFormatModal(true)}
              />
              <SettingsRow
                icon="calendar-clear-outline"
                label={t('settings.monthStart')}
                value={t('settings.monthStartValue', { day: normalizeStartDay(monthStartDay) })}
                onPress={() => setShowMonthStartSheet(true)}
              />
              {exportRow}
              {cloudCopyRow}
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
                        <Icon name="close" size={16} color={ui.expenseText} />
                        <Text style={[styles.requestBtnText, { color: ui.expenseText }]}>
                          {t('sharedAccount.reject')}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.requestBtn, { backgroundColor: withAlpha(ui.incomeText, 0.14) }]}
                        onPress={() => handleApproveRequest(req.uid, req.displayName)}
                      >
                        <Icon name="checkmark" size={16} color={ui.incomeText} />
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
                    <Avatar
                      uri={getMemberPhoto(sharedAccount, memberId)}
                      style={[styles.memberAvatar, { backgroundColor: ui.accentSoft }]}
                      zoomTitle={name}
                    >
                      <Text style={[styles.memberInitial, { color: ui.accent }]}>
                        {name[0].toUpperCase()}
                      </Text>
                    </Avatar>
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
              {/* El enlace de invitación, en su propia hoja: arriba del todo
                  ocupaba mucho con la dirección entera a la vista */}
              <SettingsRow
                icon="mail-outline"
                label={t('sharedAccount.inviteMembers')}
                onPress={() => setShowInviteSheet(true)}
              />
            </SettingsSection>

            {/* Cómo se personaliza la cuenta compartida */}
            <SettingsSection title={t('settings.sharedPreferences')}>
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
                icon="coins-duotone"
                label={t('settings.currency')} value={selectedSharedCurrencyLabel}
                onPress={() => setShowSharedCurrencyModal(true)}
              />
              <SettingsRow
                icon="calendar-outline"
                label={t('settings.dateFormat')} value={selectedSharedDateFormatLabel}
                onPress={() => setShowSharedDateFormatModal(true)}
              />
              <SettingsRow
                icon="calendar-clear-outline"
                label={t('settings.monthStart')}
                value={t('settings.monthStartValue', { day: normalizeStartDay(sharedMonthStartDay) })}
                onPress={() => setShowSharedMonthStartSheet(true)}
              />
              <SettingsRow
                icon="notifications-outline"
                label={t('sharedAccount.notifTitle')}
                subtitle={t('sharedAccount.notifSubtitle')}
                right={<Switch {...switchProps(notificationsEnabled)} onValueChange={setNotificationsEnabled} />}
              />
              {exportRow}
              {cloudCopyRow}
            </SettingsSection>

            {appSection}

            <SettingsSection title={t('settings.accountSection')}>
              {isCreator && (
                <SettingsRow
                  icon="pencil-outline"
                  label={t('sharedAccount.renameAccount')}
                  onPress={openSharedNameSheet}
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
        onClose={() => setEditingName(false)}
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
        onClose={() => setEditingSharedName(false)}
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
      {/* iOS: hora del recordatorio diario (en Android, la ventana del sistema) */}
      {Platform.OS === 'ios' && (
        <BottomSheet
          visible={showDailyTimeSheet}
          onClose={() => {
            setShowDailyTimeSheet(false);
            setEnablingDaily(false);
          }}
          // Se guarda cuando la hoja ya no está: el aviso de activado, con
          // ella aún cerrándose, iOS podía no enseñarlo
          onClosed={() => {
            const pending = dailyTimeToSave.current;
            dailyTimeToSave.current = null;
            if (pending) saveDailyTime(pending.date, pending.enabling);
          }}
          title={t('settings.dailyReminderTime')}
          footer={(
            <SheetButton
              label={t('settings.save')}
              onPress={() => {
                dailyTimeToSave.current = { date: dailyTimeDraft, enabling: enablingDaily };
                setShowDailyTimeSheet(false);
              }}
            />
          )}
        >
          <DateTimePicker
            value={dailyTimeDraft}
            mode="time"
            display="spinner"
            is24Hour={i18n.language !== 'en'}
            textColor={dc.textPrimary}
            themeVariant={isDark ? 'dark' : 'light'}
            onChange={(_, date) => { if (date) setDailyTimeDraft(date); }}
          />
        </BottomSheet>
      )}
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
      <MonthStartSheet
        visible={showMonthStartSheet}
        selected={normalizeStartDay(monthStartDay)}
        onSave={(day) => saveSettings({ monthStartDay: day })}
        onDismiss={() => setShowMonthStartSheet(false)}
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
      <BottomSheet
        visible={showInviteSheet}
        onClose={() => setShowInviteSheet(false)}
        title={t('sharedAccount.inviteLink')}
        subtitle={t('sharedAccount.inviteInfo')}
      >
        <View style={[styles.invite, { backgroundColor: ui.field }]}>
          <Text style={[styles.linkText, { color: dc.textPrimary }]} numberOfLines={2}>
            {getInviteLink()}
          </Text>
        </View>
        <View style={styles.linkButtons}>
          <TouchableOpacity
            style={[styles.linkBtn, { backgroundColor: linkCopied ? withAlpha(ui.incomeText, 0.14) : ui.field }]}
            onPress={handleCopyLink}
          >
            <Icon
              name={linkCopied ? 'checkmark-circle' : 'copy-outline'}
              size={16}
              color={linkCopied ? ui.incomeText : ui.accent}
            />
            <Text style={[styles.linkBtnText, { color: linkCopied ? ui.incomeText : ui.accent }]}>
              {linkCopied ? t('sharedAccount.linkCopied') : t('sharedAccount.copyLink')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.linkBtn, { backgroundColor: ui.field }]}
            onPress={handleShareLink}
          >
            <Icon name="share-social-outline" size={16} color={ui.accent} />
            <Text style={[styles.linkBtnText, { color: ui.accent }]}>
              {t('sharedAccount.shareLink')}
            </Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>
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
      <MonthStartSheet
        visible={showSharedMonthStartSheet}
        selected={normalizeStartDay(sharedMonthStartDay)}
        onSave={(day) => sharedAccount && saveSharedSettings(sharedAccount.id, { monthStartDay: day })}
        onDismiss={() => setShowSharedMonthStartSheet(false)}
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
                          // queda: lo que añadió sigue firmado, tachado. Su
                          // foto, no: ya no es de la cuenta
                          await firestore()
                            .collection('sharedAccounts')
                            .doc(sharedAccount.id)
                            .update({
                              members: firestore.FieldValue.arrayRemove(memberId),
                              [`memberPhotos.${memberId}`]: firestore.FieldValue.delete(),
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
              <Avatar
                uri={getMemberPhoto(sharedAccount, memberId)}
                style={[styles.memberAvatar, { backgroundColor: ui.accentSoft }]}
              >
                <Text style={[styles.memberInitial, { color: ui.accent }]}>
                  {name[0].toUpperCase()}
                </Text>
              </Avatar>
              <Text style={[styles.memberName, styles.memberInfo, { color: dc.textPrimary }]}>{name}</Text>
              <Icon name="person-remove-outline" size={18} color={ui.expenseText} />
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
  avatarWrap: { flexShrink: 0 },
  avatarBusy: { position: 'absolute', top: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  avatarEdit: {
    position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center',
  },
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

  // Enlace de invitación (en su hoja)
  invite: { borderRadius: 16, padding: 14 },
  linkText: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', lineHeight: 19 },
  linkButtons: { flexDirection: 'row', gap: 8, marginTop: 10 },
  linkBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, padding: 12, borderRadius: 14,
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
