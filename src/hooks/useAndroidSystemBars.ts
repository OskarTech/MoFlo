import { useEffect } from 'react';
import { Appearance, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { useSettingsStore } from '../store/settingsStore';
import { useTheme } from './useTheme';

// expo-navigation-bar es nativo: una build anterior a él no lo trae y cargarlo
// sin más rompería el arranque, así que solo se carga si está
const NavigationBar: typeof import('expo-navigation-bar') | null =
  Platform.OS === 'android' && requireOptionalNativeModule('ExpoNavigationBar') != null
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- un import normal fallaría al arrancar sin el módulo nativo
    ? require('expo-navigation-bar')
    : null;

/**
 * Android: la barra de navegación del sistema sigue el modo de la app, no el
 * del móvil. Con navegación por botones Android pone un velo detrás de la
 * barra, claro u oscuro según el modo del móvil: con el móvil en claro y la
 * app en "Siempre oscuro" quedaba una franja gris clara bajo la barra de abajo.
 * - El modo de la app pasa a Android, así las ventanas que se abren desde abajo
 *   (y los avisos y el calendario del sistema) salen con el mismo modo.
 * - La barra de la pantalla principal se ajusta aparte, porque React Native
 *   solo la configura al abrir la app.
 */
export const useAndroidSystemBars = () => {
  const themeMode = useSettingsStore((s) => s.themeMode);
  const { isDark } = useTheme();

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    // null: vuelve a seguir el modo del móvil
    Appearance.setColorScheme(themeMode === 'auto' ? null : themeMode);
    NavigationBar?.setStyle(isDark ? 'dark' : 'light');
  }, [themeMode, isDark]);
};
