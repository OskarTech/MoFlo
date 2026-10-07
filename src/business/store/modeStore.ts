import { create } from 'zustand';
import { COLOR_PALETTES, ColorPaletteId } from '../../theme';

/**
 * Si la app está en la cuenta de empresa, y con qué paleta. Va aparte del
 * store de la empresa y sin dependencias: lo leen useTheme y RootNavigator, y
 * así no cargan nada de la empresa.
 */
export const useBusinessModeStore = create<{ active: boolean; paletteId: ColorPaletteId | null }>(() => ({
  active: false,
  paletteId: null,
}));

/** La paleta de la empresa: la elegida o, si no hay, Carbón */
export const resolveBusinessPalette = (raw: string | null | undefined): ColorPaletteId =>
  (raw && raw in COLOR_PALETTES ? (raw as ColorPaletteId) : 'charcoal');
