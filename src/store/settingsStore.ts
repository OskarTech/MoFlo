import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import i18n, { getDeviceLanguage } from '../i18n';
import {
  saveSettingsToFirestore,
  fetchSettingsFromFirestore,
} from '../services/firebase/firestore.service';
import { ColorPaletteId } from '../theme';
import { CURRENCIES } from '../constants/currencies';
import { refreshDailyNotificationLanguage } from '../services/notifications.service';
import { deletePhotos, uploadPhoto, userPhotoFolder } from '../services/firebase/photo.service';
import { normalizeStartDay } from '../utils/period';

const syncDisplayNameToSharedAccounts = async (uid: string, displayName: string) => {
  const snapshot = await firestore()
    .collection('sharedAccounts')
    .where('members', 'array-contains', uid)
    .get();

  if (snapshot.empty) return;

  const batch = firestore().batch();
  let hasChanges = false;
  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    if (data?.memberNames?.[uid] !== displayName) {
      batch.update(doc.ref, { [`memberNames.${uid}`]: displayName });
      hasChanges = true;
    }
  });
  if (hasChanges) await batch.commit();
};

// Los demás miembros no pueden leer tu usuario: tu foto se copia a cada cuenta
// compartida en la que estés, como el nombre
const syncPhotoToSharedAccounts = async (uid: string, photoURL: string | null) => {
  const snapshot = await firestore()
    .collection('sharedAccounts')
    .where('members', 'array-contains', uid)
    .get();

  if (snapshot.empty) return;

  const batch = firestore().batch();
  let hasChanges = false;
  snapshot.docs.forEach((doc) => {
    if ((doc.data()?.memberPhotos?.[uid] ?? null) !== photoURL) {
      batch.update(doc.ref, {
        [`memberPhotos.${uid}`]: photoURL ?? firestore.FieldValue.delete(),
      });
      hasChanges = true;
    }
  });
  if (hasChanges) await batch.commit();
};

const STORAGE_KEY = '@moflo_settings';

// En su propio archivo: los usa formatAmount, que no puede cargar este store
export { CURRENCIES };
export type { Currency } from '../constants/currencies';

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'pl', label: 'Polski' },
  { code: 'fr', label: 'Français' },
  { code: 'pt', label: 'Português' },
  { code: 'it', label: 'Italiano' },
  { code: 'de', label: 'Deutsch' },
];

const isSupportedLanguage = (lang?: string): lang is string =>
  !!lang && LANGUAGES.some((l) => l.code === lang);

export type ThemeMode = 'auto' | 'light' | 'dark';
export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY';
export type { ColorPaletteId };

interface SettingsStore {
  displayName: string;
  currencyCode: string;
  language: string;
  themeMode: ThemeMode;
  dateFormat: DateFormat;
  colorPalette: ColorPaletteId;
  hapticsEnabled: boolean;
  // Enlace a la foto de perfil en Storage; null sin foto
  photoURL: string | null;
  // Día en que empieza el mes de la cuenta individual (ver utils/period)
  monthStartDay: number;
  isLoading: boolean;

  loadSettings: () => Promise<void>;
  saveSettings: (settings: Partial<{
    photoURL: string | null;
    displayName: string;
    currencyCode: string;
    language: string;
    themeMode: ThemeMode;
    dateFormat: DateFormat;
    colorPalette: ColorPaletteId;
    hapticsEnabled: boolean;
    monthStartDay: number;
  }>) => Promise<void>;
  setProfilePhoto: (localUri: string | null) => Promise<void>;
  getCurrencySymbol: () => string;
  adoptDisplayNameIfMissing: (name?: string | null, persist?: boolean) => Promise<void>;
  resetStore: () => void;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  displayName: '',
  currencyCode: 'EUR',
  language: i18n.language ?? 'en',
  themeMode: 'auto',
  dateFormat: 'DD/MM/YYYY',
  colorPalette: 'green',
  hapticsEnabled: true,
  photoURL: null,
  monthStartDay: 1,
  isLoading: false,

  resetStore: () => set({
    photoURL: null,
    displayName: '',
    currencyCode: 'EUR',
    language: i18n.language ?? 'en',
    themeMode: 'auto',
    dateFormat: 'DD/MM/YYYY',
    colorPalette: 'green',
    hapticsEnabled: true,
    monthStartDay: 1,
  }),

  loadSettings: async () => {
    set({ isLoading: true });
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // 'auto' u otro valor no soportado: se mantiene el idioma del dispositivo
        if (!isSupportedLanguage(parsed.language)) delete parsed.language;
        set(parsed);
        if (parsed.language) await i18n.changeLanguage(parsed.language);
      }

      const uid = auth().currentUser?.uid;
      if (!uid) return;

      // Solo si Firestore ha respondido se sabe de verdad que no hay nombre
      let firestoreChecked = false;
      try {
        const firestoreSettings = await fetchSettingsFromFirestore();
        firestoreChecked = true;
        const hasLanguage = isSupportedLanguage(firestoreSettings?.language);
        const language = hasLanguage
          ? firestoreSettings!.language
          : isSupportedLanguage(get().language) ? get().language : getDeviceLanguage();
        if (firestoreSettings) {
          const typedSettings = {
            ...firestoreSettings,
            language,
            themeMode: (firestoreSettings.themeMode as ThemeMode) ?? 'auto',
            dateFormat: (firestoreSettings.dateFormat as DateFormat) ?? 'DD/MM/YYYY',
            colorPalette: (firestoreSettings.colorPalette as ColorPaletteId) ?? 'green',
            // Ajustes nuevos: las cuentas antiguas no los tienen guardados
            hapticsEnabled: firestoreSettings.hapticsEnabled ?? true,
            photoURL: firestoreSettings.photoURL ?? null,
            monthStartDay: normalizeStartDay(firestoreSettings.monthStartDay),
          };
          set(typedSettings);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(typedSettings));
          await i18n.changeLanguage(language);
        }
        // Sin idioma guardado la Cloud Function envía las notificaciones en inglés.
        // Sin await: con mala conexión no bloquea el arranque.
        if (!hasLanguage) {
          firestore()
            .collection('users').doc(uid)
            .set({ settings: { language } }, { merge: true })
            .catch(() => {});
        }
      } catch (firestoreError: any) {
        if (firestoreError?.code !== 'firestore/permission-denied') {
          console.error('Error syncing settings from Firestore:', firestoreError);
        }
      }

      // Con Google o Apple nadie guardaba el nombre en los ajustes: el Home
      // saludaba con "Usuario" hasta que se cambiaba a mano. Se toma el de la
      // cuenta si todavía no hay ninguno.
      await get().adoptDisplayNameIfMissing(auth().currentUser?.displayName, firestoreChecked);

      // Si el idioma cambió (por ejemplo, desde otro dispositivo), la diaria se
      // reprograma con el texto nuevo. Sin await: no retrasa el arranque.
      refreshDailyNotificationLanguage();
    } catch (e) {
      console.error('Error loading settings:', e);
    } finally {
      set({ isLoading: false });
    }
  },

  saveSettings: async (newSettings) => {
    const previousDisplayName = get().displayName;
    const previousPhotoURL = get().photoURL;
    const current = {
      photoURL: get().photoURL,
      displayName: get().displayName,
      currencyCode: get().currencyCode,
      language: get().language,
      themeMode: get().themeMode,
      dateFormat: get().dateFormat,
      colorPalette: get().colorPalette,
      hapticsEnabled: get().hapticsEnabled,
      monthStartDay: get().monthStartDay,
    };
    const updated = { ...current, ...newSettings };
    set(updated);

    // Sin esperar a Firestore: el cambio ya está en la app y en el móvil, y
    // Firestore lo guarda y lo sube solo al volver la conexión. Esperándolo,
    // sin internet la ventana del nombre no se cerraba y el idioma no cambiaba
    // hasta recuperarla (lo mismo que pasaba con las huchas)
    saveSettingsToFirestore(updated).catch((e) =>
      console.error('Firestore settings sync error:', e)
    );
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

    if (
      newSettings.displayName !== undefined &&
      newSettings.displayName !== previousDisplayName
    ) {
      const uid = auth().currentUser?.uid;
      if (uid) {
        syncDisplayNameToSharedAccounts(uid, newSettings.displayName).catch((e) =>
          console.error('Error syncing displayName to shared accounts:', e)
        );
      }
    }

    if (newSettings.photoURL !== undefined && newSettings.photoURL !== previousPhotoURL) {
      const uid = auth().currentUser?.uid;
      if (uid) {
        syncPhotoToSharedAccounts(uid, newSettings.photoURL).catch((e) =>
          console.error('Error syncing photo to shared accounts:', e)
        );
      }
    }

    if (newSettings.language) {
      await i18n.changeLanguage(newSettings.language);
      await refreshDailyNotificationLanguage();
    }
  },

  // Sube la foto elegida (o la quita con null) y la guarda con los ajustes.
  // Los fallos se propagan: quien la llama avisa al usuario
  setProfilePhoto: async (localUri) => {
    const uid = auth().currentUser?.uid;
    if (!uid) return;
    const folder = userPhotoFolder(uid);
    if (localUri) {
      const url = await uploadPhoto(folder, localUri);
      await get().saveSettings({ photoURL: url });
    } else {
      await get().saveSettings({ photoURL: null });
      deletePhotos(folder).catch(() => {});
    }
  },

  getCurrencySymbol: () => {
    const { currencyCode } = get();
    return CURRENCIES.find((c) => c.code === currencyCode)?.symbol ?? '€';
  },

  // Rellena el nombre solo si todavía no hay ninguno. `persist` solo cuando se
  // sabe que Firestore tampoco lo tiene: si no se ha podido comprobar (sin
  // conexión, por ejemplo), se queda en esta sesión y no pisa nunca un nombre
  // que el usuario haya puesto a mano. En la siguiente carga manda Firestore.
  adoptDisplayNameIfMissing: async (name, persist = false) => {
    const trimmed = name?.trim();
    if (!trimmed || get().displayName) return;
    set({ displayName: trimmed });
    if (!persist) return;

    const {
      photoURL, displayName, currencyCode, language, themeMode, dateFormat, colorPalette, hapticsEnabled,
      monthStartDay,
    } = get();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
      photoURL, displayName, currencyCode, language, themeMode, dateFormat, colorPalette, hapticsEnabled,
      monthStartDay,
    })).catch(() => {});
    const uid = auth().currentUser?.uid;
    if (uid) {
      // Sin await: con mala conexión no bloquea el arranque
      firestore()
        .collection('users').doc(uid)
        .set({ settings: { displayName: trimmed } }, { merge: true })
        .catch(() => {});
    }
  },
}));