import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../i18n';
import {
  saveSettingsToFirestore,
  fetchSettingsFromFirestore,
} from '../services/firebase/firestore.service';

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
];

export type ThemeMode = 'auto' | 'light' | 'dark';

interface SettingsStore {
  displayName: string;
  currencyCode: string;
  language: string;
  themeMode: ThemeMode;
  isLoading: boolean;

  loadSettings: () => Promise<void>;
  saveSettings: (settings: Partial<{
    displayName: string;
    currencyCode: string;
    language: string;
    themeMode: ThemeMode;
  }>) => Promise<void>;
  getCurrencySymbol: () => string;
  resetStore: () => void;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  // ── ESTADO INICIAL ─────────────────────────────────────────────
  displayName: '',
  currencyCode: 'EUR',
  language: i18n.language ?? 'en',
  themeMode: 'auto',
  isLoading: false,

  // ── RESET ──────────────────────────────────────────────────────
  resetStore: () => set({
    displayName: '',
    currencyCode: 'EUR',
    language: i18n.language ?? 'en',
    themeMode: 'auto',
  }),

  // ── CARGAR AJUSTES ─────────────────────────────────────────────
  loadSettings: async () => {
    set({ isLoading: true });
    try {
      // 1. Carga local primero
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        set(parsed);
        if (parsed.language) await i18n.changeLanguage(parsed.language);
      }

      // 2. Sincroniza con Firestore
      const firestoreSettings = await fetchSettingsFromFirestore();
      if (firestoreSettings) {
        const typedSettings = {
          ...firestoreSettings,
          themeMode: (firestoreSettings.themeMode as ThemeMode) ?? 'auto',
        };
        set(typedSettings);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(typedSettings));
        if (typedSettings.language) {
          await i18n.changeLanguage(typedSettings.language);
        }
      }
    } catch (e) {
      console.error('Error loading settings:', e);
    } finally {
      set({ isLoading: false });
    }
  },

  // ── GUARDAR AJUSTES ────────────────────────────────────────────
  saveSettings: async (newSettings) => {
    const current = {
      displayName: get().displayName,
      currencyCode: get().currencyCode,
      language: get().language,
      themeMode: get().themeMode,
    };
    const updated = { ...current, ...newSettings };
    set(updated);

    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)),
      saveSettingsToFirestore(updated).catch((e) =>
        console.error('Firestore settings sync error:', e)
      ),
    ]);

    if (newSettings.language) {
      await i18n.changeLanguage(newSettings.language);
    }
  },

  // ── SÍMBOLO DE MONEDA ──────────────────────────────────────────
  getCurrencySymbol: () => {
    const { currencyCode } = get();
    return CURRENCIES.find((c) => c.code === currencyCode)?.symbol ?? '€';
  },
}));