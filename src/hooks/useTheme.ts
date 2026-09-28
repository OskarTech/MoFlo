import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { getDynamicColors, colors, resolvePaletteId } from '../theme';
import { CATEGORY_COLORS } from '../theme/categoryColors';
import { getUiColors } from '../theme/ui';
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

  const effectivePalette = resolvePaletteId(isSharedMode ? sharedColorPalette : colorPalette, isSharedMode);

  // El objeto se reutiliza mientras no cambien tema ni paleta: sin esto cada
  // fila de cada lista construía uno nuevo en cada render
  return useMemo(
    () => {
      const dynamic = getDynamicColors(isDark, effectivePalette);
      return {
        isDark,
        // Los colores elegidos para las categorías se guardan por paleta
        paletteId: effectivePalette,
        colors: {
          ...colors,
          ...dynamic,
        },
        // Tonos del diseño con cabecera de color (ver theme/ui)
        ui: getUiColors(dynamic, isDark),
        // Los de las categorías, de la paleta y el modo activos (ver useCategoryColors)
        categoryColors: CATEGORY_COLORS[effectivePalette][isDark ? 'dark' : 'light'],
      };
    },
    [isDark, effectivePalette],
  );
};
