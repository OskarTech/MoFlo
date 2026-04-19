import { useColorScheme } from 'react-native';
import { getDynamicColors, getSharedDynamicColors, colors, sharedColors } from '../theme';
import { useSettingsStore } from '../store/settingsStore';
import { useSharedAccountStore } from '../store/sharedAccountStore';

export const useTheme = () => {
  const colorScheme = useColorScheme();
  const { themeMode } = useSettingsStore();
  const { isSharedMode } = useSharedAccountStore();

  const isDark =
    themeMode === 'dark'
      ? true
      : themeMode === 'light'
      ? false
      : colorScheme === 'dark';

  const dynamic = isSharedMode
    ? getSharedDynamicColors(isDark)
    : getDynamicColors(isDark);

  const staticColors = isSharedMode
    ? { ...colors, ...sharedColors }
    : colors;

  return {
    isDark,
    colors: {
      ...staticColors,
      ...dynamic,
    },
  };
};