import { formatDate, getDateLocale } from '../dateFormat';

// Ajustes de formato simulados: los stores reales cargarían Firebase
// (jest.mock se aplica antes de los imports)
let mockDateFormat = 'DD/MM/YYYY';
let mockShared = { isSharedMode: false, sharedDateFormat: 'DD/MM/YYYY' };

jest.mock('../../store/settingsStore', () => ({
  useSettingsStore: { getState: () => ({ dateFormat: mockDateFormat }) },
}));
jest.mock('../../store/sharedAccountStore', () => ({
  useSharedAccountStore: { getState: () => mockShared },
}));

beforeEach(() => {
  mockDateFormat = 'DD/MM/YYYY';
  mockShared = { isSharedMode: false, sharedDateFormat: 'DD/MM/YYYY' };
});

describe('getDateLocale', () => {
  it.each([
    ['es', 'es-ES'],
    ['en', 'en-US'],
    ['pl', 'pl-PL'],
    ['de', 'de-DE'],
    ['fr', 'fr-FR'],
    ['it', 'it-IT'],
    ['pt', 'pt-PT'],
    ['pt-BR', 'pt-PT'],
    ['en-GB', 'en-US'],
  ])('%s usa %s', (language, locale) => {
    expect(getDateLocale(language)).toBe(locale);
  });

  it('un idioma desconocido o vacío usa español', () => {
    expect(getDateLocale('ja')).toBe('es-ES');
    expect(getDateLocale(undefined)).toBe('es-ES');
  });
});

describe('formatDate', () => {
  const march5 = new Date(2026, 2, 5, 12).toISOString();

  it('respeta el ajuste DD/MM o MM/DD', () => {
    expect(formatDate(march5)).toBe('05/03/2026');
    mockDateFormat = 'MM/DD/YYYY';
    expect(formatDate(march5)).toBe('03/05/2026');
  });

  it('en una cuenta compartida manda el formato de la cuenta', () => {
    mockShared = { isSharedMode: true, sharedDateFormat: 'MM/DD/YYYY' };
    expect(formatDate(march5)).toBe('03/05/2026');
  });

  it('usa el día local, no el de UTC', () => {
    // 1 de enero a las 00:30 en España es todavía 31 de diciembre en UTC
    expect(formatDate(new Date(2026, 0, 1, 0, 30).toISOString())).toBe('01/01/2026');
  });
});
