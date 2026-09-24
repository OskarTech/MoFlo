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

/**
 * Importe tal y como debe aparecer dentro de un campo de texto editable:
 * con el separador decimal del idioma activo y sin separador de miles.
 *
 * Los campos de edición se rellenaban con `String(amount)`, que siempre usa el
 * punto como decimal. En español, alemán, italiano y portugués eso enseñaba
 * "1234.56" en un campo mientras el resto de la app mostraba "1.234,56", y al
 * reescribirlo el punto se interpretaba como separador de miles.
 */
export const formatAmountForInput = (amount: number): string => {
  if (!Number.isFinite(amount)) return '';
  const { decimal } = getSeparators();
  // toFixed(2) solo cuando hace falta: un importe redondo se escribe "20", no "20,00"
  const raw = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return raw.replace('.', decimal);
};

/**
 * Convierte lo que el usuario ha escrito en un importe.
 *
 * Antes se hacía `parseFloat(texto.replace(',', '.'))`, que rompía en cuanto
 * aparecía un separador de miles: "1.234,56" acababa en parseFloat("1.234.56")
 * y se guardaban 1,23 € sin aviso ninguno.
 *
 * Reglas, en orden:
 *  1. Si aparecen los dos separadores, el último es el decimal y el otro de miles.
 *  2. Si el mismo separador se repite y agrupa bien los millares ("1.234.567":
 *     de 1 a 3 cifras delante, sin cero inicial, y bloques de 3 detrás), es de
 *     miles. Si no ("1.234.56", una errata), se aplica la regla 4.
 *  3. Un único separador con exactamente tres dígitos detrás es ambiguo
 *     ("1.234"): se resuelve con el separador de miles del idioma activo.
 *     Un cero delante nunca agrupa millares, así que "0.234" son decimales.
 *  4. En cualquier otro caso es el separador decimal.
 */
export const parseAmountInput = (raw: string): number => {
  if (!raw) return NaN;
  // Los espacios de millar de francés y polaco caen aquí también
  const cleaned = raw.replace(/[^0-9.,]/g, '');
  if (!cleaned) return NaN;

  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  const lastSep = Math.max(lastDot, lastComma);
  if (lastSep === -1) return Number(cleaned);

  const sepChar = lastSep === lastDot ? '.' : ',';
  const head = cleaned.slice(0, lastSep);
  const digitsBefore = head.replace(/[.,]/g, '');
  const digitsAfter = cleaned.slice(lastSep + 1).replace(/[.,]/g, '');

  const bothSeparators = lastDot !== -1 && lastComma !== -1;
  const repeated = head.includes(sepChar);
  // Antes el separador repetido acababa como decimal: "1.234.567" se guardaba
  // como 1.234,57 sin aviso
  const groups = cleaned.split(sepChar);
  const groupedThousands = !bothSeparators
    && repeated
    && /^[1-9]\d{0,2}$/.test(groups[0])
    && groups.slice(1).every((group) => /^\d{3}$/.test(group));
  const ambiguous = !bothSeparators
    && !repeated
    && digitsAfter.length === 3
    && digitsBefore.length > 0
    && !digitsBefore.startsWith('0');

  const isThousands = groupedThousands
    || (ambiguous && sepChar === getSeparators().thousands);

  const value = isThousands
    ? Number(digitsBefore + digitsAfter)
    : Number(`${digitsBefore || '0'}.${digitsAfter || '0'}`);

  return Number.isFinite(value) ? value : NaN;
};
