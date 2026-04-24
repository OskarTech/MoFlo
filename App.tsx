import './src/i18n';
import React, { useEffect } from 'react';
import { MD3LightTheme, MD3DarkTheme, PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import { Linking, useColorScheme } from 'react-native';
import {
  useFonts, Poppins_400Regular, Poppins_500Medium,
  Poppins_600SemiBold, Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator, { navigationRef } from './src/navigation/RootNavigator';
import { COLOR_PALETTES } from './src/theme';
import { useSettingsStore } from './src/store/settingsStore';

SplashScreen.preventAutoHideAsync();

export default function App() {
  const colorScheme = useColorScheme();
  const { themeMode, colorPalette } = useSettingsStore();

  const isDark = themeMode === 'dark'
    ? true
    : themeMode === 'light'
    ? false
    : colorScheme === 'dark';

  const p = COLOR_PALETTES[colorPalette ?? 'green'];

  const theme = isDark
    ? {
        ...MD3DarkTheme,
        colors: {
          ...MD3DarkTheme.colors,
          primary: p.primaryLight,
          secondary: p.primaryDark,
          background: p.darkBg,
          surface: p.darkSurface,
          onSurface: p.darkTextPrimary ?? '#F9FAFB',
          outline: p.darkBorder,
        },
      }
    : {
        ...MD3LightTheme,
        colors: {
          ...MD3LightTheme.colors,
          primary: p.primary,
          secondary: p.lightTextPrimary ?? '#1F2937',
          background: p.lightBg,
          surface: p.lightSurface ?? '#FFFFFF',
          onSurface: p.lightTextPrimary ?? '#1F2937',
          outline: p.lightBorder,
        },
      };

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    const processDeepLink = (url: string) => {
      const match = url.match(/[?&]code=([A-Z0-9]{6})/i);
      if (!match) return;
      const code = match[1].toUpperCase();
      if (navigationRef.isReady()) {
        navigationRef.navigate('SharedAccount', { code, fromDeepLink: true });
      }
    };

    const subscription = Linking.addEventListener('url', (event) => processDeepLink(event.url));

    // Cold start: app abierta desde el link
    Linking.getInitialURL().then((url) => {
      if (!url) return;
      const tryNavigate = (retries = 0) => {
        if (navigationRef.isReady()) {
          processDeepLink(url);
        } else if (retries < 20) {
          setTimeout(() => tryNavigate(retries + 1), 100);
        }
      };
      tryNavigate();
    });

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
