import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { getDynamicColors, colors, COLOR_PALETTES, ColorPaletteId } from '../theme';
import { CATEGORY_COLORS } from '../theme/categoryColors';
import { useSettingsStore } from '../store/settingsStore';
import { useSharedAccountStore } from '../store/sharedAccountStore';

export const useTheme = () => {
  const colorScheme = useColorScheme();
  // Con selector y no `useSettingsStore()` entero: así un cambio en cualquier
  // otro campo del store (o un snapshot de Firestore que reemplaza el objeto
  // `sharedAccount`) no vuelve a renderizar todo componente que use el tema.
  const themeMode = useSettingsStore((s) => s.themeMode);
  const colorPalette = useSettingsStore((s) => s.colorPalette);
  const isSharedMode = useSharedAccountStore((s) => s.isSharedMode);
  const sharedColorPalette = useSharedAccountStore((s) => s.sharedColorPalette);

  const isDark =
    themeMode === 'dark'
      ? true
      : themeMode === 'light'
      ? false
      : colorScheme === 'dark';

  const effectivePalette: ColorPaletteId = (() => {
    const raw = isSharedMode ? sharedColorPalette : colorPalette;
    return raw && raw in COLOR_PALETTES ? raw : (isSharedMode ? 'navy' : 'green');
  })();

  // El objeto se reutiliza mientras no cambien tema ni paleta: sin esto cada
  // fila de cada lista construía uno nuevo en cada render
  return useMemo(
    () => ({
      isDark,
      colors: {
        ...colors,
        ...getDynamicColors(isDark, effectivePalette),
      },
      // Los de las categorías, de la paleta y el modo activos (ver useCategoryColors)
      categoryColors: CATEGORY_COLORS[effectivePalette][isDark ? 'dark' : 'light'],
    }),
    [isDark, effectivePalette],
  );
};
