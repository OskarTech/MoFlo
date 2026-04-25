import { useColorScheme } from 'react-native';
import { getDynamicColors, colors, COLOR_PALETTES, ColorPaletteId } from '../theme';
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

  const effectivePalette: ColorPaletteId = (() => {
    const raw = isSharedMode ? sharedColorPalette : colorPalette;
    return raw && raw in COLOR_PALETTES ? raw : (isSharedMode ? 'blue' : 'green');
  })();

  const dynamic = getDynamicColors(isDark, effectivePalette);

  return {
    isDark,
    colors: {
      ...colors,
      ...dynamic,
    },
  };
};
