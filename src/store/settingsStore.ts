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

const STORAGE_KEY = '@moflo_settings';

export interface Currency {
  code: string;
  symbol: string;
  label: string;
}

export const CURRENCIES: Currency[] = [
  { code: 'EUR', symbol: '€', label: 'Euro (€)' },
  { code: 'USD', symbol: '$', label: 'Dollar ($)' },
  { code: 'GBP', symbol: '£', label: 'Pound (£)' },
  { code: 'PLN', symbol: 'zł', label: 'Złoty (zł)' },
  { code: 'CHF', symbol: 'CHF', label: 'Franc (CHF)' },
  { code: 'MXN', symbol: 'MX$', label: 'Peso (MX$)' },
];

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
  isLoading: boolean;

  loadSettings: () => Promise<void>;
  saveSettings: (settings: Partial<{
    displayName: string;
    currencyCode: string;
    language: string;
    themeMode: ThemeMode;
    dateFormat: DateFormat;
    colorPalette: ColorPaletteId;
  }>) => Promise<void>;
  getCurrencySymbol: () => string;
  resetStore: () => void;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  displayName: '',
  currencyCode: 'EUR',
  language: i18n.language ?? 'en',
  themeMode: 'auto',
  dateFormat: 'DD/MM/YYYY',
  colorPalette: 'green',
  isLoading: false,

  resetStore: () => set({
    displayName: '',
    currencyCode: 'EUR',
    language: i18n.language ?? 'en',
    themeMode: 'auto',
    dateFormat: 'DD/MM/YYYY',
    colorPalette: 'green',
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

      try {
        const firestoreSettings = await fetchSettingsFromFirestore();
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
    } catch (e) {
      console.error('Error loading settings:', e);
    } finally {
      set({ isLoading: false });
    }
  },

  saveSettings: async (newSettings) => {
    const previousDisplayName = get().displayName;
    const current = {
      displayName: get().displayName,
      currencyCode: get().currencyCode,
      language: get().language,
      themeMode: get().themeMode,
      dateFormat: get().dateFormat,
      colorPalette: get().colorPalette,
    };
    const updated = { ...current, ...newSettings };
    set(updated);

    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)),
      saveSettingsToFirestore(updated).catch((e) =>
        console.error('Firestore settings sync error:', e)
      ),
    ]);

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

    if (newSettings.language) {
      await i18n.changeLanguage(newSettings.language);
    }
  },

  getCurrencySymbol: () => {
    const { currencyCode } = get();
    return CURRENCIES.find((c) => c.code === currencyCode)?.symbol ?? '€';
  },
}));