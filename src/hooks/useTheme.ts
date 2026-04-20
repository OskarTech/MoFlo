import { useColorScheme } from 'react-native';
import { getDynamicColors, colors } from '../theme';
import { useSettingsStore } from '../store/settingsStore';
import { useSharedAccountStore } from '../store/sharedAccountStore';

export const useTheme = () => {
  const colorScheme = useColorScheme();
  const { themeMode, colorPalette } = useSettingsStore();
  const { isSharedMode, sharedColorPalette } = useSharedAccountStore();

  const isDark =
    themeMode === 'dark'
      ? true
      : themeMode === 'light'
      ? false
      : colorScheme === 'dark';

  const effectivePalette = isSharedMode
    ? (sharedColorPalette ?? 'blue')
    : (colorPalette ?? 'green');

  const dynamic = getDynamicColors(isDark, effectivePalette);

  return {
    isDark,
    colors: {
      ...colors,
      ...dynamic,
    },
  };
};
