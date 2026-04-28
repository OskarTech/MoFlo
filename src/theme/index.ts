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

export type ColorPaletteId = 'green' | 'blue' | 'earth' | 'mint' | 'rose' | 'mono';

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
}

export const COLOR_PALETTES: Record<ColorPaletteId, PaletteEntry> = {
  green: {
    primary: '#166534', primaryLight: '#4ADE80', primaryDark: '#065F46',
    lightBg: '#F0FAF4', lightBorder: '#D1FAE5', lightBalanceCard: '#166534',
    darkBg: '#0F1110', darkSurface: '#1C2120', darkBorder: '#2E3330', darkBalanceCard: '#065F46',
    income: '#10B981', expense: '#EF4444', savings: '#F59E0B',
  },
  blue: {
    primary: '#1D4ED8', primaryLight: '#60A5FA', primaryDark: '#1E40AF',
    lightBg: '#EFF6FF', lightBorder: '#BFDBFE', lightBalanceCard: '#1D4ED8',
    darkBg: '#0F172A', darkSurface: '#1E293B', darkBorder: '#1E3A5F', darkBalanceCard: '#1E40AF',
    income: '#3B82F6', expense: '#F43F5E', savings: '#F97316',
  },
  earth: {
    primary: '#2D4A3E', primaryLight: '#8FB8A0', primaryDark: '#1E3329',
    lightBg: '#F3EDE2', lightBorder: '#DDD0BC', lightBalanceCard: '#2D4A3E',
    darkBg: '#141210', darkSurface: '#24211D', darkBorder: '#3A302A', darkBalanceCard: '#2D4A3E',
    income: '#4A7C59', expense: '#C85A3C', savings: '#D4A373',
  },
  mint: {
    primary: '#3E5BA3',
    primaryLight: '#84D175',
    primaryDark: '#0C2D45',
    lightBg: '#E6FBDA',
    lightSurface: '#ffffff',
    lightBorder: '#C5EDB0',
    lightBalanceCard: '#3E5BA3',
    lightTextPrimary: '#0C2D45',
    lightTextSecondary: '#3E5BA3',
    darkBg: '#071829',
    darkSurface: '#0C2D45',
    darkBorder: '#1B4030',
    darkBalanceCard: '#3E5BA3',
    darkTextPrimary: '#fafafa',
    income: '#84D175', expense: '#E8735A', savings: '#E8A25A',
  },
  rose: {
    primary: '#81036A',
    primaryLight: '#FC7EE5',
    primaryDark: '#4A013D',
    lightBg: '#FFF8D4',
    lightSurface: '#FFFFFF',
    lightBorder: '#F5CEE9',
    lightBalanceCard: '#A6087F',
    lightTextPrimary: '#28011F',
    lightTextSecondary: '#6B1F5A',
    darkBg: '#0F0E0B',
    darkSurface: '#1E1B16',
    darkBorder: '#5C1349',
    darkBalanceCard: '#A6087F',
    darkTextPrimary: '#FFF6D0',
    darkTextSecondary: '#A89D82',
    income: '#10B981', expense: '#FB905B', savings: '#E6B905',
    darkSavings: '#FACD19',
  },
  mono: {
    primary: '#1F2937',
    primaryLight: '#9CA3AF',
    primaryDark: '#000000',
    lightBg: '#F5F5F5',
    lightSurface: '#FFFFFF',
    lightBorder: '#E4E4E7',
    lightBalanceCard: '#1F2937',
    lightTextPrimary: '#111827',
    lightTextSecondary: '#6B7280',
    darkBg: '#0A0A0A',
    darkSurface: '#1C1C1C',
    darkBorder: '#3F3F46',
    darkBalanceCard: '#3F3F46',
    darkTextPrimary: '#F4F4F5',
    darkTextSecondary: '#A1A1AA',
    darkPrimary: '#A1A1AA',
    income: '#10B981', expense: '#EF4444', savings: '#F59E0B',
  },
};

export const getDynamicColors = (isDark: boolean, paletteId: ColorPaletteId = 'green') => {
  const p = COLOR_PALETTES[paletteId] ?? COLOR_PALETTES['green'];
  return {
    primary: isDark ? (p.darkPrimary ?? p.primary) : p.primary,
    primaryLight: p.primaryLight,
    primaryDark: p.primaryDark,
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
