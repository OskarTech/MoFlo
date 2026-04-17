import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Purchases from 'react-native-purchases';
import auth from '@react-native-firebase/auth';

const PREMIUM_KEY = '@moflo_premium';

const REVENUECAT_API_KEY = 'goog_SAFOqDvIHgdKmDuegCaDuzpfZFr';

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
      // 1. Carga local primero para respuesta inmediata
      const cached = await AsyncStorage.getItem(PREMIUM_KEY);
      if (cached === 'true') set({ isPremium: true });

      // 2. Verifica con RevenueCat — fuente de verdad
      const uid = auth().currentUser?.uid;
      if (uid) {
        await Purchases.configure({ apiKey: REVENUECAT_API_KEY });
        await Purchases.logIn(uid);
        const customerInfo = await Purchases.getCustomerInfo();
        const isPremium = !!customerInfo.entitlements.active['premium'];
        set({ isPremium });
        await AsyncStorage.setItem(PREMIUM_KEY, String(isPremium));
      }
    } catch (e) {
      // Si RevenueCat falla usa el valor local
      const cached = await AsyncStorage.getItem(PREMIUM_KEY);
      set({ isPremium: cached === 'true' });
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