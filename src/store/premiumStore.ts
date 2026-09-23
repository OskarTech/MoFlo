import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Purchases from 'react-native-purchases';
import auth from '@react-native-firebase/auth';
import {
  ensurePurchasesUser,
  hasPremiumEntitlement,
  tryRecoverPurchase,
} from '../services/revenuecat';
import { reportError } from '../services/crashReporting';

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
      // 1. Carga local primero para respuesta inmediata
      const cached = await AsyncStorage.getItem(PREMIUM_KEY);
      if (cached === 'true') set({ isPremium: true });

      // 2. Verifica con RevenueCat — fuente de verdad, con timeout de 5s
      const uid = auth().currentUser?.uid;
      if (uid) {
        const revenueCatCheck = async () => {
          await ensurePurchasesUser();
          let info = await Purchases.getCustomerInfo();

          // Rescate de las compras que quedaron bajo otro App User ID cuando la
          // app aún no identificaba al usuario en RevenueCat. Se intenta una
          // sola vez por usuario y solo en Android, donde no se le enseña nada.
          //
          // Solo si este móvil tenía ya el premium concedido: con las
          // transferencias activadas en RevenueCat, una restauración se lleva
          // la compra al usuario que la pide, así que nunca debe lanzarse sola
          // en una cuenta que no la ha tenido. Para ese caso está el botón de
          // restaurar, que lo pide la persona a propósito.
          if (!hasPremiumEntitlement(info) && cached === 'true') {
            const recovered = await tryRecoverPurchase(uid);
            if (recovered) info = recovered;
          }

          if (hasPremiumEntitlement(info)) {
            set({ isPremium: true });
            await AsyncStorage.setItem(PREMIUM_KEY, 'true');
            return;
          }

          // El premium solo se retira si la respuesta venía de este usuario.
          // Antes se guardaba 'false' sin comprobarlo, así que un arranque con
          // la identidad equivocada borraba la única prueba local de la compra
          // y ya no había vuelta atrás.
          if ((await Purchases.getAppUserID()) === uid) {
            set({ isPremium: false });
            await AsyncStorage.setItem(PREMIUM_KEY, 'false');
          }
        };

        // El fallo se recoge aquí dentro: si gana el timeout, el rechazo
        // llegaría cuando el catch de fuera ya no está escuchando.
        const guarded = revenueCatCheck().catch((e) => reportError(e, 'loadPremium'));
        const timeout = new Promise<void>((resolve) => setTimeout(resolve, 5000));
        await Promise.race([guarded, timeout]);
      }
    } catch (e) {
      // Se conserva lo que hubiera en local: el estado solo se toca arriba,
      // cuando ya hay una respuesta de RevenueCat de la que fiarse.
      reportError(e, 'loadPremium');
    } finally {
      set({ isLoading: false });
    }
  },

  setPremium: async (value) => {
    await AsyncStorage.setItem(PREMIUM_KEY, String(value));
    set({ isPremium: value });
  },
}));
