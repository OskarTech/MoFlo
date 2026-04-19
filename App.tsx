import './src/i18n';
import React, { useEffect } from 'react';
import { PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import { Linking, useColorScheme } from 'react-native';
import {
  useFonts, Poppins_400Regular, Poppins_500Medium,
  Poppins_600SemiBold, Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { lightTheme, darkTheme } from './src/theme';
import { useMovementStore } from './src/store/movementStore';
import { useSettingsStore } from './src/store/settingsStore';
import { usePremiumStore } from './src/store/premiumStore';
import { useCategoryStore } from './src/store/categoryStore';
import { useSharedAccountStore } from './src/store/sharedAccountStore';
import { useSharedCategoryStore } from './src/store/sharedCategoryStore';
import { useSavingsStore } from './src/store/savingsStore';

SplashScreen.preventAutoHideAsync();

export default function App() {
  const colorScheme = useColorScheme();
  const { loadData, applyRecurringMovements, loadSharedData, setSharedAccountId } = useMovementStore();
  const { loadSettings, themeMode } = useSettingsStore();
  const { loadPremium } = usePremiumStore();
  const { loadCategories } = useCategoryStore();
  const { loadSharedAccount } = useSharedAccountStore();

  const isDark = themeMode === 'dark'
    ? true
    : themeMode === 'light'
    ? false
    : colorScheme === 'dark';

  const theme = isDark ? darkTheme : lightTheme;

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => {
    const init = async () => {
      await loadSettings();
      await loadPremium();
      await loadCategories();
      await loadSharedAccount();

      const { isSharedMode: shared, sharedAccount: account } =
        useSharedAccountStore.getState();

      if (shared && account) {
        setSharedAccountId(account.id);
        useSavingsStore.getState().setSharedAccountId(account.id);
        await loadSharedData(account.id);
        await useSavingsStore.getState().loadSharedSavings(account.id);
        await applyRecurringMovements();
        await useSharedCategoryStore.getState().loadSharedCategories(account.id);
        useSharedCategoryStore.getState().subscribeToSharedCategories(account.id);
        await useSharedAccountStore.getState().loadSharedSettings(account.id);
      } else {
        setSharedAccountId(null);
        useSavingsStore.getState().setSharedAccountId(null);
        await loadData();
        await useSavingsStore.getState().loadSavings();
        await applyRecurringMovements();
      }

      if (fontsLoaded) {
        await SplashScreen.hideAsync();
      }
    };
    init();
  }, [fontsLoaded]);

  useEffect(() => {
    const handleUrl = (event: { url: string }) => {
      console.log('Deep link received:', event.url);
    };
    const subscription = Linking.addEventListener('url', handleUrl);
    return () => subscription.remove();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <RootNavigator />
      </PaperProvider>
    </SafeAreaProvider>
  );
}