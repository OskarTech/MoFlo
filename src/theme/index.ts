import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';

export const colors = {
  // ── PRIMARIO (Verde MoFlo) ─────────────────────────────────
  primary: '#166534',
  primaryLight: '#4ADE80',
  primaryDark: '#065F46',

  // ── SEMÁNTICOS ─────────────────────────────────────────────
  income: '#10B981',
  expense: '#EF4444',
  savings: '#F59E0B',

  // ── MODO CLARO ─────────────────────────────────────────────
  background: '#F0FAF4',
  surface: '#FFFFFF',
  textPrimary: '#1F2937',
  textSecondary: '#6B7280',
  border: '#D1FAE5',

  // ── MODO OSCURO ────────────────────────────────────────────
  backgroundDark: '#0F1110',
  surfaceDark: '#1C2120',
  textPrimaryDark: '#F9FAFB',
  textSecondaryDark: '#9CA3AF',
  borderDark: '#2E3330',

  // ── OTROS ──────────────────────────────────────────────────
  secondary: '#1F2937',
};

// ── PALETA CUENTA COMPARTIDA (Azul) ────────────────────────────
export const sharedColors = {
  primary: '#1D4ED8',
  primaryLight: '#60A5FA',
  primaryDark: '#1E40AF',
  secondary: '#1E3A5F',
};

// ── PALETAS DE COLOR ───────────────────────────────────────────

export type ColorPaletteId =
  | 'green' | 'earth' | 'rose' | 'mono' | 'navy' | 'wine' | 'lime'
  | 'teal' | 'cocoa' | 'sunset' | 'aurora' | 'charcoal';

interface PaletteEntry {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  lightBg: string;
  lightBorder: string;
  lightBalanceCard: string;
  darkBg: string;
  darkSurface: string;
  darkBorder: string;
  darkBalanceCard: string;
  income: string;
  expense: string;
  savings: string;
  // Optional palette-specific overrides
  lightSurface?: string;
  lightTextPrimary?: string;
  lightTextSecondary?: string;
  darkTextPrimary?: string;
  darkTextSecondary?: string;
  darkIncome?: string;
  darkExpense?: string;
  darkSavings?: string;
  darkPrimary?: string;
  // Brillo de la esquina de la cabecera, si no es primaryLight (que además es
  // el color de los detalles en oscuro): con algunos tonos la mezcla con la
  // cabecera salía marrón o gris
  lightGlow?: string;
  darkGlow?: string;
}

export const COLOR_PALETTES: Record<ColorPaletteId, PaletteEntry> = {
  green: {
    primary: '#166534', primaryLight: '#4ADE80', primaryDark: '#065F46',
    lightBg: '#E9F5EC', lightBorder: '#D1FAE5', lightBalanceCard: '#166534',
    lightTextSecondary: '#5C6963',
    darkBg: '#0C120E', darkSurface: '#171F1A', darkBorder: '#2E3330', darkBalanceCard: '#14532D',
    darkPrimary: '#15803D',
    income: '#10B981', expense: '#EF4444', savings: '#F59E0B',
  },
  earth: {
    primary: '#2D4A3E', primaryLight: '#8FB8A0', primaryDark: '#1E3329',
    lightBg: '#F1E8D8', lightSurface: '#FCF9F3', lightBorder: '#DDD0BC', lightBalanceCard: '#2D4A3E',
    lightTextSecondary: '#5E6660',
    darkBg: '#13110E', darkSurface: '#22201B', darkBorder: '#3A302A', darkBalanceCard: '#2D4A3E',
    darkPrimary: '#4F7A66',
    income: '#4A7C59', expense: '#C85A3C', savings: '#D4A373',
  },
  rose: {
    primary: '#81036A',
    primaryLight: '#FC7EE5',
    primaryDark: '#4A013D',
    lightBg: '#FFF8D4',
    lightSurface: '#FFFDF6',
    lightBorder: '#F5CEE9',
    lightBalanceCard: '#A6087F',
    lightTextPrimary: '#28011F',
    lightTextSecondary: '#6B1F5A',
    darkBg: '#110C12',
    darkSurface: '#1F1820',
    darkBorder: '#5C1349',
    darkBalanceCard: '#A6087F',
    darkTextPrimary: '#FFF6D0',
    darkTextSecondary: '#A89D82',
    darkPrimary: '#A6087F',
    lightGlow: '#FFC94D',
    darkGlow: '#FFC94D',
    income: '#10B981', expense: '#F5854A', savings: '#E6B905',
    darkSavings: '#FACD19',
  },
  mono: {
    primary: '#18181B',
    primaryLight: '#D4D4D8',
    primaryDark: '#000000',
    lightBg: '#F4F4F5',
    lightSurface: '#FFFFFF',
    lightBorder: '#E4E4E7',
    lightBalanceCard: '#18181B',
    lightTextPrimary: '#111827',
    lightTextSecondary: '#63636B',
    darkBg: '#0A0A0B',
    darkSurface: '#18181A',
    darkBorder: '#3F3F46',
    darkBalanceCard: '#27272A',
    darkTextPrimary: '#F4F4F5',
    darkTextSecondary: '#A1A1AA',
    // Gris oscuro: sobre el claro de antes, el + blanco del botón no se veía
    darkPrimary: '#52525B',
    lightGlow: '#B4B4BD',
    darkGlow: '#E4E4E7',
    income: '#10B981', expense: '#EF4444', savings: '#F59E0B',
  },
  // Azul marino + dorado
  navy: {
    primary: '#1B2A4A',
    primaryLight: '#D4AF37',
    primaryDark: '#0E1729',
    lightBg: '#F5EFDD',
    lightSurface: '#FFFDF8',
    lightBorder: '#E9DDB5',
    lightBalanceCard: '#1B2A4A',
    lightTextPrimary: '#0E1729',
    lightTextSecondary: '#4A5A7A',
    darkBg: '#080C17',
    darkSurface: '#141C2E',
    darkBorder: '#4A3F1E',
    darkBalanceCard: '#1B2F5C',
    darkTextPrimary: '#F7EFD8',
    darkTextSecondary: '#A9A28A',
    darkPrimary: '#2F5C9E',
    income: '#10B981', expense: '#EF4444', savings: '#C9A227',
    darkSavings: '#E6C35C',
  },
  // Burdeos + beige
  wine: {
    primary: '#6D1A2A',
    primaryLight: '#E8C9A0',
    primaryDark: '#3F0E18',
    lightBg: '#F5ECE6',
    lightSurface: '#FFFCFA',
    lightBorder: '#DCDCE0',
    lightBalanceCard: '#7A1F33',
    lightTextPrimary: '#2A0A11',
    lightTextSecondary: '#6B5A5E',
    darkBg: '#120D0B',
    darkSurface: '#1F1816',
    darkBorder: '#5A1E2B',
    darkBalanceCard: '#7A1F33',
    darkTextPrimary: '#F5E9D6',
    darkTextSecondary: '#A8988A',
    darkPrimary: '#A33348',
    income: '#10B981', expense: '#E0603A', savings: '#C99A4B',
    darkSavings: '#E0B866',
  },
  // Verde oliva muy oscuro + verde lima
  lime: {
    primary: '#4D7C0F',
    primaryLight: '#A3E635',
    primaryDark: '#000000',
    lightBg: '#F4F9E8',
    lightSurface: '#FFFFFF',
    lightBorder: '#DDEFB8',
    lightBalanceCard: '#25340B',
    lightTextPrimary: '#0A0A0A',
    lightTextSecondary: '#5B6152',
    darkBg: '#080808',
    darkSurface: '#161616',
    darkBorder: '#2E3A14',
    // Oliva muy oscuro: en negro no se separaba del fondo
    darkBalanceCard: '#1B2409',
    darkTextPrimary: '#F4F4F0',
    darkTextSecondary: '#9CA38F',
    income: '#16A34A', expense: '#EF4444', savings: '#F59E0B',
  },
  // Petróleo + melocotón
  teal: {
    primary: '#0F5257',
    primaryLight: '#FF8A65',
    primaryDark: '#072F33',
    lightBg: '#FFF1E8',
    lightSurface: '#FFFFFF',
    lightBorder: '#F9D6C3',
    lightBalanceCard: '#0F5257',
    lightTextPrimary: '#06282B',
    lightTextSecondary: '#6E5A50',
    darkBg: '#0B100F',
    darkSurface: '#161F1E',
    darkBorder: '#4A3229',
    darkBalanceCard: '#0F5257',
    darkTextPrimary: '#FDEDE3',
    darkTextSecondary: '#AD988C',
    darkPrimary: '#0F766E',
    // Turquesa: el melocotón mezclado con el petróleo daba una esquina marrón
    lightGlow: '#5EEAD4',
    darkGlow: '#5EEAD4',
    income: '#12A594', expense: '#E5614A', savings: '#F0894F',
    darkSavings: '#FFA870',
  },
  // Cacao + azul
  cocoa: {
    primary: '#6B4F35',
    primaryLight: '#5B9BD5',
    primaryDark: '#432F1E',
    lightBg: '#EAF2FA',
    lightSurface: '#FFFFFF',
    lightBorder: '#C6DCF0',
    lightBalanceCard: '#6B4F35',
    lightTextPrimary: '#2B1D12',
    lightTextSecondary: '#546B80',
    darkBg: '#0A0D11',
    darkSurface: '#151B21',
    darkBorder: '#28405A',
    darkBalanceCard: '#6B4F35',
    darkTextPrimary: '#E8F0F8',
    darkTextSecondary: '#8FA3B5',
    darkPrimary: '#8A6642',
    // Turquesa: el azul mezclado con el marrón daba una esquina gris
    lightGlow: '#22D3EE',
    darkGlow: '#22D3EE',
    income: '#4F9D69', expense: '#C4553D', savings: '#3E7CB1',
    darkSavings: '#5B9BD5',
  },
  // Ciruela + naranja
  sunset: {
    primary: '#6B2154',
    primaryLight: '#FFB38A',
    primaryDark: '#45123A',
    lightBg: '#FAECE5',
    lightSurface: '#FFFAF7',
    lightBorder: '#F3D9CC',
    lightBalanceCard: '#6B2154',
    lightTextPrimary: '#2B0F22',
    lightTextSecondary: '#7A5A6C',
    darkBg: '#110B10',
    darkSurface: '#1D141B',
    darkBorder: '#4A2A3F',
    darkBalanceCard: '#5A1B47',
    darkTextPrimary: '#FBEDE6',
    darkTextSecondary: '#AC95A0',
    darkPrimary: '#9C3478',
    lightGlow: '#FF8A4C',
    darkGlow: '#FF8A4C',
    income: '#1FAE7A', expense: '#E5484D', savings: '#F2A33A',
  },
  // Índigo + verde menta
  aurora: {
    primary: '#1A1F4E',
    primaryLight: '#6FF2C4',
    primaryDark: '#0F1233',
    lightBg: '#EDEFF9',
    lightSurface: '#FFFFFF',
    lightBorder: '#D5D9F0',
    lightBalanceCard: '#1A1F4E',
    lightTextPrimary: '#12163A',
    lightTextSecondary: '#5D6388',
    darkBg: '#0A0B18',
    darkSurface: '#14162B',
    darkBorder: '#2A2E5C',
    darkBalanceCard: '#1B2057',
    darkTextPrimary: '#ECEEFF',
    darkTextSecondary: '#9397B8',
    darkPrimary: '#3B43A9',
    lightGlow: '#4FF0B7',
    darkGlow: '#4FF0B7',
    income: '#17B890', expense: '#F05A5A', savings: '#F2B84B',
  },
  // Gris carbón + ámbar
  charcoal: {
    primary: '#26282C',
    primaryLight: '#FFC44D',
    primaryDark: '#141517',
    lightBg: '#F3F1EC',
    lightSurface: '#FFFFFF',
    lightBorder: '#E3DFD6',
    lightBalanceCard: '#26282C',
    lightTextPrimary: '#1B1C1F',
    lightTextSecondary: '#6B6A66',
    darkBg: '#0E0F11',
    darkSurface: '#1A1B1E',
    darkBorder: '#3A3A3A',
    darkBalanceCard: '#2A2C31',
    darkTextPrimary: '#F5F3EE',
    darkTextSecondary: '#A3A09A',
    darkPrimary: '#9A6514',
    lightGlow: '#FFB224',
    darkGlow: '#FFB224',
    income: '#22A36B', expense: '#E5484D', savings: '#F5A524',
  },
};

// La paleta en uso: la guardada si existe; si no, la de siempre (verde en la
// cuenta individual, azul marino en la compartida)
export const resolvePaletteId = (raw: string | null | undefined, isShared: boolean): ColorPaletteId =>
  raw && raw in COLOR_PALETTES ? (raw as ColorPaletteId) : isShared ? 'navy' : 'green';

export const getDynamicColors = (isDark: boolean, paletteId: ColorPaletteId = 'green') => {
  const p = COLOR_PALETTES[paletteId] ?? COLOR_PALETTES['green'];
  return {
    primary: isDark ? (p.darkPrimary ?? p.primary) : p.primary,
    primaryLight: p.primaryLight,
    primaryDark: p.primaryDark,
    heroGlow: (isDark ? p.darkGlow : p.lightGlow) ?? p.primaryLight,
    background: isDark ? p.darkBg : p.lightBg,
    surface: isDark ? p.darkSurface : (p.lightSurface ?? '#FFFFFF'),
    textPrimary: isDark ? (p.darkTextPrimary ?? '#F9FAFB') : (p.lightTextPrimary ?? '#1F2937'),
    textSecondary: isDark ? (p.darkTextSecondary ?? '#9CA3AF') : (p.lightTextSecondary ?? '#6B7280'),
    border: isDark ? p.darkBorder : p.lightBorder,
    cardBackground: isDark ? p.darkSurface : (p.lightSurface ?? '#FFFFFF'),
    balanceCard: isDark ? p.darkBalanceCard : p.lightBalanceCard,
    income: isDark ? (p.darkIncome ?? p.income) : p.income,
    expense: isDark ? (p.darkExpense ?? p.expense) : p.expense,
    savings: isDark ? (p.darkSavings ?? p.savings) : p.savings,
  };
};

export const getSharedDynamicColors = (isDark: boolean) => ({
  primary: '#1D4ED8',
  primaryLight: '#60A5FA',
  primaryDark: '#1E40AF',
  background: isDark ? '#0F172A' : '#EFF6FF',
  surface: isDark ? '#1E293B' : '#FFFFFF',
  textPrimary: isDark ? '#F9FAFB' : '#1F2937',
  textSecondary: isDark ? '#9CA3AF' : '#6B7280',
  border: isDark ? '#1E3A5F' : '#BFDBFE',
  cardBackground: isDark ? '#1E293B' : '#FFFFFF',
  balanceCard: isDark ? '#1E40AF' : '#1D4ED8',
});

export const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#166534',
    secondary: '#1F2937',
    background: '#F0FAF4',
    surface: '#FFFFFF',
    onSurface: '#1F2937',
    outline: '#D1FAE5',
  },
};

export const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#4ADE80',
    secondary: '#065F46',
    background: '#0F1110',
    surface: '#1C2120',
    onSurface: '#F9FAFB',
    outline: '#2E3330',
  },
};

export interface Reminder {
  id: string;
  title: string;
  description: string;
  date: string; // ISO string
  notificationId: string;
  createdAt: string;
}
