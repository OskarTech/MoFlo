import { useColorScheme } from 'react-native';
import { getDynamicColors, colors } from '../theme';
import { useSettingsStore } from '../store/settingsStore';

export const useTheme = () => {
  const colorScheme = useColorScheme();
  const { themeMode } = useSettingsStore();

  // Determina si es oscuro según la preferencia del usuario
  const isDark =
    themeMode === 'dark'
      ? true
      : themeMode === 'light'
      ? false
      : colorScheme === 'dark'; // 'auto' → usa el sistema

  const dynamic = getDynamicColors(isDark);

  return {
    isDark,
    colors: {
      ...colors,
      ...dynamic,
    },
  };
};