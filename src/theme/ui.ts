import { mixHex, withAlpha } from '../utils/color';

interface BaseColors {
  primary: string;
  primaryLight: string;
  background: string;
  surface: string;
  textPrimary: string;
  balanceCard: string;
  income: string;
  expense: string;
  savings: string;
}

// Tonos del diseño con cabecera de color, sacados de la paleta activa:
// - La cabecera es el color de la tarjeta de balance, con un brillo de primaryLight.
// - accent: el color de los detalles (en oscuro, primaryLight, que se lee mejor).
// - Los rellenos y las líneas son el color del texto con transparencia, así
//   sirven igual en cualquier paleta y modo.
// - incomeText/expenseText: verde y rojo oscurecidos (o aclarados en oscuro)
//   para que un importe escrito se lea bien; el de la paleta queda para gráficos.
export const getUiColors = (c: BaseColors, isDark: boolean) => {
  const accent = isDark ? c.primaryLight : c.primary;
  return {
    hero: c.balanceCard,
    heroGlow: c.primaryLight,
    heroGlowOpacity: isDark ? 0.32 : 0.5,
    accent,
    accentSoft: withAlpha(accent, 0.15),
    onAccent: isDark ? c.background : '#FFFFFF',
    fill: withAlpha(c.textPrimary, 0.06),
    fill2: withAlpha(c.textPrimary, 0.09),
    hair: withAlpha(c.textPrimary, 0.1),
    hair2: withAlpha(c.textPrimary, 0.18),
    sheet: c.surface,
    // Lo que va encima de la hoja (pestaña activa, tarjetas flotantes)
    sheetRaised: isDark ? mixHex(c.surface, '#FFFFFF', 0.07) : c.surface,
    // Fondo de los campos y de las tarjetas dentro de la hoja
    field: c.background,
    incomeText: isDark ? mixHex(c.income, '#FFFFFF', 0.22) : mixHex(c.income, '#000000', 0.38),
    expenseText: isDark ? mixHex(c.expense, '#FFFFFF', 0.2) : mixHex(c.expense, '#000000', 0.3),
    savingsText: isDark ? c.savings : mixHex(c.savings, '#000000', 0.3),
    expenseSoft: withAlpha(c.expense, 0.14),
    glass: withAlpha(c.surface, 0.82),
    glassEdge: withAlpha(c.textPrimary, 0.1),
    // Sobre la cabecera de color
    onHero: '#FFFFFF',
    onHeroSoft: 'rgba(255,255,255,0.8)',
    heroFill: 'rgba(255,255,255,0.16)',
  };
};

export type UiColors = ReturnType<typeof getUiColors>;
