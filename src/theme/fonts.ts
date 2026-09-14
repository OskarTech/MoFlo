import AsyncStorage from '@react-native-async-storage/async-storage';

// Fuente de la app elegida por cada usuario en su móvil (como el modo claro/oscuro).
// No se sincroniza con Firestore ni afecta a la cuenta compartida: cada miembro ve la suya.
export type AppFontId =
  | 'poppins' | 'inter' | 'nunito' | 'manrope'
  | 'dmSans' | 'plusJakartaSans' | 'outfit' | 'quicksand';

const FONT_STORAGE_KEY = '@moflo_app_font';

interface FontFiles {
  regular: number;
  medium: number;
  semiBold: number;
  bold: number;
}

// Solo los 4 grosores que usa la app (importar el paquete entero incluiría todas las variantes)
const FONT_FILES: Record<AppFontId, FontFiles> = {
  poppins: {
    regular: require('@expo-google-fonts/poppins/400Regular/Poppins_400Regular.ttf'),
    medium: require('@expo-google-fonts/poppins/500Medium/Poppins_500Medium.ttf'),
    semiBold: require('@expo-google-fonts/poppins/600SemiBold/Poppins_600SemiBold.ttf'),
    bold: require('@expo-google-fonts/poppins/700Bold/Poppins_700Bold.ttf'),
  },
  inter: {
    regular: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
    medium: require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
    semiBold: require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'),
    bold: require('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf'),
  },
  nunito: {
    regular: require('@expo-google-fonts/nunito/400Regular/Nunito_400Regular.ttf'),
    medium: require('@expo-google-fonts/nunito/500Medium/Nunito_500Medium.ttf'),
    semiBold: require('@expo-google-fonts/nunito/600SemiBold/Nunito_600SemiBold.ttf'),
    bold: require('@expo-google-fonts/nunito/700Bold/Nunito_700Bold.ttf'),
  },
  manrope: {
    regular: require('@expo-google-fonts/manrope/400Regular/Manrope_400Regular.ttf'),
    medium: require('@expo-google-fonts/manrope/500Medium/Manrope_500Medium.ttf'),
    semiBold: require('@expo-google-fonts/manrope/600SemiBold/Manrope_600SemiBold.ttf'),
    bold: require('@expo-google-fonts/manrope/700Bold/Manrope_700Bold.ttf'),
  },
  dmSans: {
    regular: require('@expo-google-fonts/dm-sans/400Regular/DMSans_400Regular.ttf'),
    medium: require('@expo-google-fonts/dm-sans/500Medium/DMSans_500Medium.ttf'),
    semiBold: require('@expo-google-fonts/dm-sans/600SemiBold/DMSans_600SemiBold.ttf'),
    bold: require('@expo-google-fonts/dm-sans/700Bold/DMSans_700Bold.ttf'),
  },
  plusJakartaSans: {
    regular: require('@expo-google-fonts/plus-jakarta-sans/400Regular/PlusJakartaSans_400Regular.ttf'),
    medium: require('@expo-google-fonts/plus-jakarta-sans/500Medium/PlusJakartaSans_500Medium.ttf'),
    semiBold: require('@expo-google-fonts/plus-jakarta-sans/600SemiBold/PlusJakartaSans_600SemiBold.ttf'),
    bold: require('@expo-google-fonts/plus-jakarta-sans/700Bold/PlusJakartaSans_700Bold.ttf'),
  },
  outfit: {
    regular: require('@expo-google-fonts/outfit/400Regular/Outfit_400Regular.ttf'),
    medium: require('@expo-google-fonts/outfit/500Medium/Outfit_500Medium.ttf'),
    semiBold: require('@expo-google-fonts/outfit/600SemiBold/Outfit_600SemiBold.ttf'),
    bold: require('@expo-google-fonts/outfit/700Bold/Outfit_700Bold.ttf'),
  },
  quicksand: {
    regular: require('@expo-google-fonts/quicksand/400Regular/Quicksand_400Regular.ttf'),
    medium: require('@expo-google-fonts/quicksand/500Medium/Quicksand_500Medium.ttf'),
    semiBold: require('@expo-google-fonts/quicksand/600SemiBold/Quicksand_600SemiBold.ttf'),
    bold: require('@expo-google-fonts/quicksand/700Bold/Quicksand_700Bold.ttf'),
  },
};

export const FONT_OPTIONS: { id: AppFontId; label: string }[] = [
  { id: 'poppins', label: 'Poppins' },
  { id: 'inter', label: 'Inter' },
  { id: 'nunito', label: 'Nunito' },
  { id: 'manrope', label: 'Manrope' },
  { id: 'dmSans', label: 'DM Sans' },
  { id: 'plusJakartaSans', label: 'Plus Jakarta Sans' },
  { id: 'outfit', label: 'Outfit' },
  { id: 'quicksand', label: 'Quicksand' },
];

const isAppFontId = (value: unknown): value is AppFontId =>
  FONT_OPTIONS.some((f) => f.id === value);

export const getSavedFont = async (): Promise<AppFontId> => {
  try {
    const value = await AsyncStorage.getItem(FONT_STORAGE_KEY);
    return isAppFontId(value) ? value : 'poppins';
  } catch {
    return 'poppins';
  }
};

export const saveFont = (id: AppFontId) => AsyncStorage.setItem(FONT_STORAGE_KEY, id);

// Fuente cargada en este arranque (la elegida solo se aplica al reiniciar la app)
let activeFont: AppFontId = 'poppins';
export const setActiveFont = (id: AppFontId) => { activeFont = id; };
export const getActiveFont = () => activeFont;

// Toda la app usa los nombres Poppins_*: se cargan con los archivos de la fuente elegida
export const getAppFontMap = (id: AppFontId) => {
  const files = FONT_FILES[id] ?? FONT_FILES.poppins;
  return {
    Poppins_400Regular: files.regular,
    Poppins_500Medium: files.medium,
    Poppins_600SemiBold: files.semiBold,
    Poppins_700Bold: files.bold,
  };
};

// Vista previa en el selector. La fuente activa ya está cargada como Poppins_600SemiBold;
// las demás se cargan con otro nombre para no volver a registrar el mismo archivo.
export const getPreviewFontFamily = (id: AppFontId) =>
  id === activeFont ? 'Poppins_600SemiBold' : `MofloPreview_${id}`;

export const getPreviewFontMap = () =>
  Object.fromEntries(
    FONT_OPTIONS
      .filter((option) => option.id !== activeFont)
      .map((option) => [getPreviewFontFamily(option.id), FONT_FILES[option.id].semiBold]),
  );
