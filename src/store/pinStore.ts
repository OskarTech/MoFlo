import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PIN_KEY = '@moflo_pin';
const BIOMETRICS_KEY = '@moflo_biometrics';

interface PinStore {
  pin: string | null;
  biometricsEnabled: boolean;
  loadPin: () => Promise<void>;
  setPin: (pin: string) => Promise<void>;
  removePin: () => Promise<void>;
  setBiometrics: (enabled: boolean) => Promise<void>;
  verifyPin: (input: string) => boolean;
}

export const usePinStore = create<PinStore>((set, get) => ({
  pin: null,
  biometricsEnabled: false,

  loadPin: async () => {
    try {
      const [pin, biometrics] = await Promise.all([
        AsyncStorage.getItem(PIN_KEY),
        AsyncStorage.getItem(BIOMETRICS_KEY),
      ]);
      set({
        pin,
        biometricsEnabled: biometrics === 'true',
      });
    } catch (e) {
      console.error('Error loading PIN:', e);
    }
  },

  setPin: async (pin) => {
    await AsyncStorage.setItem(PIN_KEY, pin);
    set({ pin });
  },

  removePin: async () => {
    await AsyncStorage.removeItem(PIN_KEY);
    set({ pin: null });
  },

  setBiometrics: async (enabled) => {
    await AsyncStorage.setItem(BIOMETRICS_KEY, String(enabled));
    set({ biometricsEnabled: enabled });
  },

  verifyPin: (input) => {
    return get().pin === input;
  },
}));