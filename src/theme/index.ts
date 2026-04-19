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
  background: '#F0FAF4',    // Verde muy suave — no más blanco puro
  surface: '#FFFFFF',       // Tarjetas blancas sobre fondo verde
  textPrimary: '#1F2937',
  textSecondary: '#6B7280',
  border: '#D1FAE5',        // Borde verde muy suave

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

export const getDynamicColors = (isDark: boolean) => ({
  background: isDark ? '#0F1110' : '#F0FAF4',
  surface: isDark ? '#1C2120' : '#FFFFFF',
  textPrimary: isDark ? '#F9FAFB' : '#1F2937',
  textSecondary: isDark ? '#9CA3AF' : '#6B7280',
  border: isDark ? '#2E3330' : '#D1FAE5',
  cardBackground: isDark ? '#1C2120' : '#FFFFFF',
  balanceCard: isDark ? '#065F46' : '#166534',
});

export const getSharedDynamicColors = (isDark: boolean) => ({
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