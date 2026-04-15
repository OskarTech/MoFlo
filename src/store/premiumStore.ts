import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREMIUM_KEY = '@moflo_premium';

interface PremiumStore {
  isPremium: boolean;
  isLoading: boolean;
  loadPremium: () => Promise<void>;
  setPremium: (value: boolean) => Promise<void>;
}

export const usePremiumStore = create<PremiumStore>((set) => ({
  isPremium: false,
  isLoading: false,

  loadPremium: async () => {
    set({ isLoading: true });
    try {
      // TEMPORAL — fuerza premium para testing
      set({ isPremium: true });
      
      // const value = await AsyncStorage.getItem(PREMIUM_KEY);
      // set({ isPremium: value === 'true' });
    } catch (e) {
      console.error('Error loading premium:', e);
    } finally {
      set({ isLoading: false });
    }
  },

  setPremium: async (value) => {
    await AsyncStorage.setItem(PREMIUM_KEY, String(value));
    set({ isPremium: value });
  },
}));