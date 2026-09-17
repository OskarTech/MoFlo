import i18n from '../i18n';
import { useSettingsStore } from '../store/settingsStore';

/**
 * Formato numérico por idioma.
 *
 * Se calcula a mano, igual que formatDate, en lugar de usar Intl.NumberFormat:
 * así el resultado es idéntico en iOS y Android sin depender de que Hermes
 * incluya la tabla ICU completa en cada plataforma.
 *
 * Separadores según CLDR para cada idioma soportado.
 */
interface Separators {
  thousands: string;
  decimal: string;
}

const SEPARATORS: Record<string, Separators> = {
  es: { thousands: '.', decimal: ',' },
  de: { thousands: '.', decimal: ',' },
  it: { thousands: '.', decimal: ',' },
  pt: { thousands: '.', decimal: ',' },
  fr: { thousands: ' ', decimal: ',' }, // espacio fino duro
  pl: { thousands: ' ', decimal: ',' }, // espacio duro
  en: { thousands: ',', decimal: '.' },
};

const DEFAULT_SEPARATORS = SEPARATORS.en;

const getSeparators = (): Separators => {
  // El idioma del ajuste manda; i18n es el respaldo al arrancar
  const lang = useSettingsStore.getState().language || i18n.language || 'en';
  return SEPARATORS[lang.split('-')[0]] ?? DEFAULT_SEPARATORS;
};

const groupThousands = (intPart: string, separator: string): string =>
  intPart.replace(/\B(?=(\d{3})+(?!\d))/g, separator);

/**
 * Parte entera y decimal ya formateadas por separado. Lo usa la tarjeta de
 * saldo del Home, que las pinta con tamaños de fuente distintos.
 */
export const splitAmountParts = (
  amount: number,
  decimals = 2,
): { intPart: string; decPart: string; decimalSeparator: string } => {
  const { thousands, decimal } = getSeparators();
  const [int, dec = ''] = Math.abs(amount).toFixed(decimals).split('.');
  return {
    intPart: groupThousands(int, thousands),
    decPart: dec,
    decimalSeparator: decimal,
  };
};

/**
 * Importe con separador de miles y decimal del idioma activo.
 * Conserva el signo negativo; los signos + se siguen añadiendo en cada pantalla.
 */
export const formatAmount = (amount: number, decimals = 2): string => {
  const { decimal } = getSeparators();
  const { intPart, decPart } = splitAmountParts(amount, decimals);
  const sign = amount < 0 ? '-' : '';
  return decPart ? `${sign}${intPart}${decimal}${decPart}` : `${sign}${intPart}`;
};

/** Importe con el símbolo de moneda detrás. */
export const formatMoney = (
  amount: number,
  currencySymbol: string,
  decimals = 2,
): string => `${formatAmount(amount, decimals)} ${currencySymbol}`;
