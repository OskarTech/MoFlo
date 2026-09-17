import './src/i18n';
import React, { useEffect, useState } from 'react';
import { MD3LightTheme, MD3DarkTheme, PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import { AppState, Linking, useColorScheme } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { getSavedFont, loadAppFontsAsync, setActiveFont } from './src/theme/fonts';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import RootNavigator, { navigationRef } from './src/navigation/RootNavigator';
import { COLOR_PALETTES } from './src/theme';
import { useSettingsStore } from './src/store/settingsStore';
import ErrorBoundary from './src/components/common/ErrorBoundary';
import UpdateAvailableModal from './src/components/common/UpdateAvailableModal';
import {
  fetchAppVersionConfig, compareVersions, AppVersionConfig,
} from './src/services/firebase/version.service';

SplashScreen.preventAutoHideAsync();

// Botones, campos de texto y demás componentes de Paper con la fuente de la app (por defecto
// usan la del sistema). Cada estilo usa el archivo de su grosor en vez de un grosor simulado.
const fontFamilyForWeight = (weight: number) =>
  weight >= 700 ? 'Poppins_700Bold'
    : weight >= 600 ? 'Poppins_600SemiBold'
    : weight >= 500 ? 'Poppins_500Medium'
    : 'Poppins_400Regular';

const PAPER_FONTS = Object.fromEntries(
  Object.entries(MD3LightTheme.fonts).map(([variant, font]) => [
    variant,
    {
      ...font,
      fontFamily: fontFamilyForWeight(Number(font.fontWeight) || 400),
      fontWeight: 'normal',
    },
  ]),
) as typeof MD3LightTheme.fonts;

export default function App() {
  const colorScheme = useColorScheme();
  const { themeMode, colorPalette } = useSettingsStore();
  const { i18n } = useTranslation();
  const [updateInfo, setUpdateInfo] = useState<{
    config: AppVersionConfig;
    forced: boolean;
  } | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  const isDark = themeMode === 'dark'
    ? true
    : themeMode === 'light'
    ? false
    : colorScheme === 'dark';

  // Si la paleta guardada no existe (p. ej. eliminada), usar la verde en vez de romper
  const p = COLOR_PALETTES[colorPalette ?? 'green'] ?? COLOR_PALETTES.green;

  const theme = isDark
    ? {
        ...MD3DarkTheme,
        fonts: PAPER_FONTS,
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
        fonts: PAPER_FONTS,
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

  // Fuente elegida por el usuario en Ajustes (se carga con los nombres Poppins_* que usa toda la app)
  const [fontsLoaded, setFontsLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fontId = await getSavedFont();
      try {
        await loadAppFontsAsync(fontId);
        setActiveFont(fontId);
      } catch (e) {
        // Si falla la fuente elegida, Poppins; y si también falla, arrancar igualmente
        console.error('Error loading app font:', e);
        await loadAppFontsAsync('poppins').catch(() => {});
      }
      if (!cancelled) setFontsLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

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

  useEffect(() => {
    const handleResponse = (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as { type?: string } | null;
      if (data?.type === 'shared_join_request') {
        const tryNavigate = (retries = 0) => {
          if (navigationRef.isReady()) {
            navigationRef.navigate('Settings', { screen: 'SharedAccount' });
          } else if (retries < 20) {
            setTimeout(() => tryNavigate(retries + 1), 100);
          }
        };
        tryNavigate();
      }
    };

    const sub = Notifications.addNotificationResponseReceivedListener(handleResponse);
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleResponse(response);
    });

    return () => sub.remove();
  }, []);

  useEffect(() => {
    const checkVersion = async () => {
      const config = await fetchAppVersionConfig();
      if (!config?.latestVersion) return;
      const current = Constants.expoConfig?.version ?? '0.0.0';
      const isOutdated = compareVersions(current, config.latestVersion) < 0;
      if (!isOutdated) return;
      const forced = !!config.minRequiredVersion
        && compareVersions(current, config.minRequiredVersion) < 0;
      setUpdateInfo({ config, forced });
    };
    checkVersion();
  }, []);

  useEffect(() => {
    Notifications.setBadgeCountAsync(0).catch(() => {});
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        Notifications.setBadgeCountAsync(0).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  if (!fontsLoaded) return null;

  const showUpdateModal = !!updateInfo && (updateInfo.forced || !updateDismissed);
  const releaseNotes = updateInfo?.config.releaseNotes?.[i18n.language]
    ?? updateInfo?.config.releaseNotes?.en;

  return (
    // Requisito de react-native-gesture-handler: sin esta raíz los gestos
    // (las filas deslizables) no responden en Android.
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ErrorBoundary>
      <SafeAreaProvider>
        <PaperProvider theme={theme}>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <RootNavigator />
          {updateInfo && (
            <UpdateAvailableModal
              visible={showUpdateModal}
              forced={updateInfo.forced}
              latestVersion={updateInfo.config.latestVersion}
              releaseNotes={releaseNotes}
              iosUrl={updateInfo.config.iosUrl}
              androidUrl={updateInfo.config.androidUrl}
              onDismiss={() => setUpdateDismissed(true)}
            />
          )}
        </PaperProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
