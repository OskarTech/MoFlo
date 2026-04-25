import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';

export const colors = {
  // ── PRIMARIO (Verde MoFlo) ─────────────────────────────────
  primary: '#166534',
  primaryLight: '#4ADE80',
  primaryDark: '#065F46',

  // ── SEMÁNTICOS ─────────────────────────────────────────────
  income: '#84D175',
  expense: '#E8735A',
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

export type ColorPaletteId = 'green' | 'blue' | 'earth' | 'mint';

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
  // Optional palette-specific overrides
  lightSurface?: string;
  lightTextPrimary?: string;
  lightTextSecondary?: string;
  darkTextPrimary?: string;
}

export const COLOR_PALETTES: Record<ColorPaletteId, PaletteEntry> = {
  green: {
    primary: '#166534', primaryLight: '#4ADE80', primaryDark: '#065F46',
    lightBg: '#F0FAF4', lightBorder: '#D1FAE5', lightBalanceCard: '#166534',
    darkBg: '#0F1110', darkSurface: '#1C2120', darkBorder: '#2E3330', darkBalanceCard: '#065F46',
  },
  blue: {
    primary: '#1D4ED8', primaryLight: '#60A5FA', primaryDark: '#1E40AF',
    lightBg: '#EFF6FF', lightBorder: '#BFDBFE', lightBalanceCard: '#1D4ED8',
    darkBg: '#0F172A', darkSurface: '#1E293B', darkBorder: '#1E3A5F', darkBalanceCard: '#1E40AF',
  },
  earth: {
    primary: '#2D4A3E', primaryLight: '#8FB8A0', primaryDark: '#1E3329',
    lightBg: '#F3EDE2', lightBorder: '#DDD0BC', lightBalanceCard: '#C85A3C',
    darkBg: '#141210', darkSurface: '#24211D', darkBorder: '#3A302A', darkBalanceCard: '#2D4A3E',
  },
  mint: {
    primary: '#3E5BA3',         // Dusk Blue
    primaryLight: '#84D175',    // Moss Green
    primaryDark: '#0C2D45',     // Deep Space Blue
    lightBg: '#E6FBDA',         // Frosted Mint
    lightSurface: '#ffffff',    // Lemon Chiffon
    lightBorder: '#C5EDB0',     // Soft mint border
    lightBalanceCard: '#3E5BA3',// Dusk Blue
    lightTextPrimary: '#0C2D45',// Deep Space Blue
    lightTextSecondary: '#3E5BA3',
    darkBg: '#0C2D45',          // Deep Space Blue
    darkSurface: '#1A4466',     // Dusk Blue darkened
    darkBorder: '#1E3A5F',
    darkBalanceCard: '#c5edb0c0',
    darkTextPrimary: '#fafafa', // Frosted Mint text on dark
  },
};

export const getDynamicColors = (isDark: boolean, paletteId: ColorPaletteId = 'green') => {
  const p = COLOR_PALETTES[paletteId] ?? COLOR_PALETTES['green'];
  return {
    primary: p.primary,
    primaryLight: p.primaryLight,
    primaryDark: p.primaryDark,
    background: isDark ? p.darkBg : p.lightBg,
    surface: isDark ? p.darkSurface : (p.lightSurface ?? '#FFFFFF'),
    textPrimary: isDark ? (p.darkTextPrimary ?? '#F9FAFB') : (p.lightTextPrimary ?? '#1F2937'),
    textSecondary: isDark ? '#9CA3AF' : (p.lightTextSecondary ?? '#6B7280'),
    border: isDark ? p.darkBorder : p.lightBorder,
    cardBackground: isDark ? p.darkSurface : (p.lightSurface ?? '#FFFFFF'),
    balanceCard: isDark ? p.darkBalanceCard : p.lightBalanceCard,
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
