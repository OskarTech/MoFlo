import {
  formatAmount,
  formatAmountForInput,
  formatMoney,
  joinMoney,
  parseAmountInput,
  splitAmountParts,
  symbolGoesBefore,
  withCurrency,
} from '../formatAmount';

// Idioma de los ajustes, que decide los separadores. Se simula el store para no
// cargar Firebase en los tests (jest.mock se aplica antes de los imports).
let mockLanguage = 'es';

jest.mock('../../store/settingsStore', () => ({
  useSettingsStore: { getState: () => ({ language: mockLanguage }) },
}));
jest.mock('../../i18n', () => ({ __esModule: true, default: { language: 'es' } }));

const NARROW_NBSP = String.fromCharCode(0x202f); // espacio fino duro (francés)
const NBSP = String.fromCharCode(0x00a0); // espacio duro (polaco)

beforeEach(() => {
  mockLanguage = 'es';
});

describe('formatAmount', () => {
  it.each([
    ['es', '1.234,56'],
    ['de', '1.234,56'],
    ['it', '1.234,56'],
    ['pt', '1.234,56'],
    ['en', '1,234.56'],
    ['fr', `1${NARROW_NBSP}234,56`],
    ['pl', `1${NBSP}234,56`],
  ])('usa los separadores de cada idioma (%s)', (language, expected) => {
    mockLanguage = language;
    expect(formatAmount(1234.56)).toBe(expected);
  });

  it('agrupa millones y redondea a dos decimales', () => {
    expect(formatAmount(1234567.891)).toBe('1.234.567,89');
  });

  it('conserva el signo negativo', () => {
    expect(formatAmount(-1234.5)).toBe('-1.234,50');
  });

  it('sin decimales no pone separador decimal', () => {
    expect(formatAmount(1234.56, 0)).toBe('1.235');
  });

  it('formatea el cero', () => {
    expect(formatAmount(0)).toBe('0,00');
  });

  it('un idioma desconocido usa el formato inglés', () => {
    mockLanguage = 'ja';
    expect(formatAmount(1234.56)).toBe('1,234.56');
  });
});

describe('splitAmountParts y formatMoney', () => {
  it('separa la parte entera y la decimal', () => {
    expect(splitAmountParts(1234.5)).toEqual({ intPart: '1.234', decPart: '50', decimalSeparator: ',' });
  });

  it('pone el símbolo de la moneda detrás', () => {
    expect(formatMoney(12.5, '€')).toBe('12,50 €');
  });

  it('el dólar, la libra, el franco suizo y el peso mexicano van delante; el resto, detrás', () => {
    expect(['€', '$', '£', 'zł', 'CHF', 'MX$'].filter(symbolGoesBefore)).toEqual(['$', '£', 'CHF', 'MX$']);
    // El de letras, con espacio
    expect(formatMoney(-12.5, 'CHF')).toBe('-CHF 12,50');
    expect(withCurrency('10', 'CHF', { sign: '+', space: false })).toBe('+CHF 10');
    expect(joinMoney('750', '3.000', 'CHF', ' de ')).toBe('CHF 750 de CHF 3.000');
    expect(formatMoney(1234.5, '$')).toBe('$1.234,50');
    expect(formatMoney(12.5, '£', { decimals: 0 })).toBe('£13');
    expect(formatMoney(12.5, 'MX$')).toBe('MX$12,50');
    expect(formatMoney(12.5, 'zł')).toBe('12,50 zł');
  });

  it('el signo va delante de todo, también el de un importe negativo', () => {
    expect(formatMoney(-12.5, '$')).toBe('-$12,50');
    expect(formatMoney(-12.5, '€')).toBe('-12,50 €');
    expect(formatMoney(12.5, '$', { sign: '+' })).toBe('+$12,50');
    expect(formatMoney(12.5, '€', { sign: '+' })).toBe('+12,50 €');
  });

  it('withCurrency y joinMoney colocan el símbolo en textos ya escritos', () => {
    expect(withCurrency('••••', '$')).toBe('$••••');
    expect(withCurrency('••••', '€')).toBe('•••• €');
    expect(withCurrency('10', '€', { sign: '+', space: false })).toBe('+10€');
    expect(withCurrency('10', '$', { sign: '+', space: false })).toBe('+$10');
    expect(joinMoney('750', '3.000', '€', ' de ')).toBe('750 de 3.000 €');
    expect(joinMoney('750', '3.000', '$', ' de ')).toBe('$750 de $3.000');
  });
});

describe('formatAmountForInput', () => {
  it('un importe redondo se escribe sin decimales', () => {
    expect(formatAmountForInput(20)).toBe('20');
  });

  it('usa el separador decimal del idioma y sin separador de miles', () => {
    expect(formatAmountForInput(1234.5)).toBe('1234,50');
    mockLanguage = 'en';
    expect(formatAmountForInput(1234.5)).toBe('1234.50');
  });

  it('un valor no numérico deja el campo vacío', () => {
    expect(formatAmountForInput(NaN)).toBe('');
    expect(formatAmountForInput(Infinity)).toBe('');
  });
});

describe('parseAmountInput', () => {
  it('un texto vacío o sin números no es un importe', () => {
    expect(parseAmountInput('')).toBeNaN();
    expect(parseAmountInput('abc')).toBeNaN();
  });

  it.each([
    ['20', 20],
    ['12,5', 12.5],
    ['12.5', 12.5],
    ['12,', 12],
    [',5', 0.5],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['1.234.567,89', 1234567.89],
    ['1 234,56', 1234.56],
    ['0.234', 0.234],
  ])('en español entiende "%s" como %s', (input, expected) => {
    expect(parseAmountInput(input)).toBe(expected);
  });

  it('"1.234" es ambiguo: se decide con el separador de miles del idioma', () => {
    expect(parseAmountInput('1.234')).toBe(1234); // español: punto de miles
    mockLanguage = 'en';
    expect(parseAmountInput('1.234')).toBe(1.234); // inglés: punto decimal
    expect(parseAmountInput('1,234')).toBe(1234);
    mockLanguage = 'fr';
    expect(parseAmountInput('1.234')).toBe(1.234); // francés agrupa con espacios
    expect(parseAmountInput(`1${NARROW_NBSP}234,5`)).toBe(1234.5);
  });

  it.each([
    ['1.234.567', 1234567],
    ['12.345.678', 12345678],
    ['1.234.567.890', 1234567890],
    ['1,234,567', 1234567],
  ])('un separador repetido que agrupa millares ("%s") es de miles', (input, expected) => {
    expect(parseAmountInput(input)).toBe(expected);
    mockLanguage = 'en';
    expect(parseAmountInput(input)).toBe(expected);
  });

  it.each([
    ['1.234.56', 1234.56], // errata: el último sigue siendo el decimal
    ['12..5', 12.5],
    ['0.234.567', 234.567], // un cero delante nunca agrupa millares
    ['1234.567.890', 1234567.89], // primer grupo de más de tres cifras
  ])('si el separador repetido no agrupa bien, "%s" se lee como antes (%s)', (input, expected) => {
    expect(parseAmountInput(input)).toBe(expected);
  });
});
