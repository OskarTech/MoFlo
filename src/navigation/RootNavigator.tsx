import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, AppState, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

import { navigationRef } from './navigationRef';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import AuthNavigator from './AuthNavigator';
import AppNavigator from './AppNavigator';
import { useMovementStore } from '../store/movementStore';
import { useSettingsStore } from '../store/settingsStore';
import { useTheme } from '../hooks/useTheme';
import { useAndroidSystemBars } from '../hooks/useAndroidSystemBars';
import { usePremiumStore } from '../store/premiumStore';
import { useCategoryStore } from '../store/categoryStore';
import { useSharedAccountStore } from '../store/sharedAccountStore';
import { useSharedCategoryStore } from '../store/sharedCategoryStore';
import { useSavingsStore } from '../store/savingsStore';
import { useReminderStore } from '../store/reminderStore';
import { processQueue } from '../services/syncQueue.service';
import { setupPushTokens } from '../services/firebase/pushTokens.service';
import { reportError, setCrashUser } from '../services/crashReporting';
import { BUSINESS_ENABLED } from '../business/featureFlag';
import { useBusinessModeStore } from '../business/store/modeStore';
import { useBusinessStore } from '../business/store/businessStore';
import BusinessNavigator from '../business/navigation/BusinessNavigator';
import { CreateBusinessHost } from '../business/ui/CreateBusinessModal';

// Se sigue exportando desde aquí para no cambiar a quien ya lo importa (App.tsx)
export { navigationRef };

const RootNavigator = () => {
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [loading, setLoading] = useState(true);
  const { colors: dc } = useTheme();
  // Si se está en la cuenta de empresa: sus pantallas en lugar de las de la app
  const businessActive = useBusinessModeStore((s) => s.active);
  useAndroidSystemBars();

  const { loadData, loadSharedData, applyRecurringMovements, setSharedAccountId } = useMovementStore();
  const { loadSettings } = useSettingsStore();
  const { loadPremium } = usePremiumStore();
  const { loadCategories, subscribeToCategories } = useCategoryStore();
  const { loadSharedAccount } = useSharedAccountStore();

  const initUser = async () => {
    await loadSettings();
    await loadPremium();
    await loadCategories();
    subscribeToCategories();
    // Los recordatorios individuales salen de AsyncStorage y hasta ahora se leían
    // al montarse la pantalla: la primera vez que se abría enseñaba "no hay
    // recordatorios" hasta que resolvía la lectura. Cargándolos aquí la pantalla
    // ya se monta con la lista puesta, igual que Movimientos o Huchas.
    // Se usa getState() y no el hook: RootNavigator no debe re-renderizar la app
    // entera cada vez que cambie un recordatorio.
    await useReminderStore.getState().loadIndividualReminders();
    await loadSharedAccount();
    setupPushTokens().catch((e) => console.warn('setupPushTokens error', e));

    const { isSharedMode: shared, sharedAccount: account } = useSharedAccountStore.getState();

    if (shared && account) {
      setSharedAccountId(account.id);
      useSavingsStore.getState().setSharedAccountId(account.id);
      await loadSharedData(account.id);
      await useSavingsStore.getState().loadSharedHuchas(account.id);
      await applyRecurringMovements();
      await useSavingsStore.getState().applyAutomaticContributions();
      await useSharedCategoryStore.getState().loadSharedCategories(account.id);
      useSharedCategoryStore.getState().subscribeToSharedCategories(account.id);
      await useSharedAccountStore.getState().loadSharedSettings(account.id);
    } else {
      setSharedAccountId(null);
      useSavingsStore.getState().setSharedAccountId(null);
      await loadData();
      await useSavingsStore.getState().loadHuchas();
      await applyRecurringMovements();
      await useSavingsStore.getState().applyAutomaticContributions();
    }

    // La cuenta de empresa (solo con ella activada, ver business/featureFlag):
    // su copia del móvil y, por detrás, la nube. Nunca para el arranque
    if (BUSINESS_ENABLED) {
      await useBusinessStore.getState().init().catch((e) => reportError(e, 'empresa: arranque'));
    }
  };

  useEffect(() => {
    const unsubscribeAuth = auth().onAuthStateChanged(async (firebaseUser) => {
      setUser(firebaseUser);
      // Solo el uid, para poder seguir el rastro de un aviso concreto
      setCrashUser(firebaseUser?.uid ?? null);
      if (firebaseUser) {
        const timeout = new Promise<void>((resolve) => setTimeout(resolve, 15000));
        try {
          await Promise.race([initUser(), timeout]);
        } catch (e) {
          reportError(e, 'initUser');
        }
        // Vaciar cola pendiente al arrancar si ya hay internet
        // (el listener de NetInfo solo dispara en reconexión, no en arranque).
        NetInfo.fetch().then((state) => {
          if (state.isConnected) processQueue().catch(() => {});
        });
      }
      setLoading(false);
    });

    let wasConnected: boolean | null = null;
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      const isConnected = !!state.isConnected;
      if (wasConnected === false && isConnected && auth().currentUser) {
        processQueue().catch(() => {});
        const { isSharedMode, sharedAccount, subscribeToSharedMovements } =
          useSharedAccountStore.getState();
        if (isSharedMode && sharedAccount) {
          subscribeToSharedMovements(sharedAccount.id);
        }
      }
      wasConnected = isConnected;
    });

    let prevKey = '';
    const unsubscribeShared = useSharedAccountStore.subscribe((state) => {
      const key = `${state.isSharedMode ? '1' : '0'}|${state.sharedAccount?.id ?? ''}`;
      if (key === prevKey) return;
      prevKey = key;
      if (state.isSharedMode && state.sharedAccount) {
        state.subscribeToSharedMovements(state.sharedAccount.id);
      }
    });

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      const { isSharedMode, sharedAccount, subscribeToSharedMovements } =
        useSharedAccountStore.getState();
      if (isSharedMode && sharedAccount) {
        subscribeToSharedMovements(sharedAccount.id);
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeNet();
      unsubscribeShared();
      appStateSub.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- una sola vez al arrancar: escucha la sesión mientras la app está abierta
  }, []);

  if (loading) {
    return (
      // Fondo y color del tema activo: sin ellos parpadeaba en blanco al
      // arrancar en modo oscuro, y el verde fijo ignoraba la paleta elegida
      <View style={{
        flex: 1, justifyContent: 'center', alignItems: 'center',
        backgroundColor: dc.background,
      }}>
        <ActivityIndicator size="large" color={dc.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      {user
        ? (BUSINESS_ENABLED && businessActive ? <BusinessNavigator /> : <AppNavigator />)
        : <AuthNavigator />}
      {/* El asistente de la empresa, aquí y no en la cabecera de Inicio (ver CreateBusinessHost) */}
      {BUSINESS_ENABLED && user ? <CreateBusinessHost /> : null}
    </NavigationContainer>
  );
};

export default RootNavigator;
