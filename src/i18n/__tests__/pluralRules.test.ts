import { createInstance } from 'i18next';
import { polishCategory, MinimalPluralRules, installPluralRules } from '../pluralRules';
import en from '../locales/en.json';
import es from '../locales/es.json';
import pl from '../locales/pl.json';
import fr from '../locales/fr.json';
import pt from '../locales/pt.json';
import itLocale from '../locales/it.json';
import de from '../locales/de.json';

// La regla de reserva de i18next: la que se usa en iOS sin Intl.PluralRules
const fallbackRule = (n: number) => (n === 1 ? 'one' : 'other');

describe('polishCategory', () => {
  it('coincide con las reglas del polaco de CLDR (las de Node), en enteros y con decimales', () => {
    const cldr = new Intl.PluralRules('pl');
    for (let n = 0; n <= 1000; n += 1) {
      expect([n, polishCategory(n)]).toEqual([n, cldr.select(n)]);
    }
    for (const n of [0.5, 1.5, 2.25, 5.5, 12.1]) {
      expect([n, polishCategory(n)]).toEqual([n, cldr.select(n)]);
    }
  });
});

describe('MinimalPluralRules', () => {
  it('en polaco usa sus cuatro formas', () => {
    for (const locale of ['pl', 'pl-PL', ['pl']]) {
      const rules = new MinimalPluralRules(locale);
      expect(rules.resolvedOptions().pluralCategories).toEqual(['one', 'few', 'many', 'other']);
      expect([1, 2, 5, 12, 22, 1.5].map((n) => rules.select(n))).toEqual(['one', 'few', 'many', 'many', 'few', 'other']);
    }
  });

  it('en el resto de idiomas, y en los ordinales, da lo mismo que hasta ahora', () => {
    const cases = [
      ...['es', 'en', 'de', 'fr', 'it', 'pt', 'es-ES'].map((locale) => new MinimalPluralRules(locale)),
      new MinimalPluralRules('pl', { type: 'ordinal' }),
    ];
    for (const rules of cases) {
      expect(rules.resolvedOptions().pluralCategories).toEqual(['one', 'other']);
      for (const n of [0, 1, 2, 5, 1.5, 1000000]) expect(rules.select(n)).toBe(fallbackRule(n));
    }
  });
});

describe('installPluralRules', () => {
  const intl = Intl as unknown as Record<string, unknown>;
  const native = intl.PluralRules;
  afterEach(() => {
    intl.PluralRules = native;
  });

  it('no cambia el del sistema si ya lo hay', () => {
    installPluralRules();
    expect(intl.PluralRules).toBe(native);
  });

  it('sin él, como en iOS, los plurales del polaco salen bien y los demás idiomas igual', async () => {
    delete intl.PluralRules;
    installPluralRules();
    expect(intl.PluralRules).toBe(MinimalPluralRules);

    const i18n = createInstance();
    await i18n.init({
      compatibilityJSON: 'v4',
      resources: {
        en: { translation: en }, es: { translation: es }, pl: { translation: pl }, fr: { translation: fr },
        pt: { translation: pt }, it: { translation: itLocale }, de: { translation: de },
      },
      lng: 'pl',
      fallbackLng: 'en',
    });
    const tPl = i18n.getFixedT('pl');
    expect([1, 2, 5, 12, 22, 25].map((count) => tPl('home.movementCount', { count }))).toEqual([
      '1 transakcja', '2 transakcje', '5 transakcji', '12 transakcji', '22 transakcje', '25 transakcji',
    ]);
    expect([1, 3, 5].map((count) => tPl('resumen.streak', { count }))).toEqual([
      'Seria 1 miesiąc', 'Seria 3 miesiące', 'Seria 5 miesięcy',
    ]);
    expect([1, 2, 5].map((count) => tPl('sharedAccount.memberCount', { count }))).toEqual([
      '1 członek', '2 członków', '5 członków',
    ]);
    expect(tPl('export.memberCount', { count: 2 })).toBe('2 członków');

    // Los demás idiomas, igual que antes: «one» solo con 1 (también el 0 en francés y portugués)
    expect([0, 1, 2].map((count) => i18n.getFixedT('es')('sharedAccount.memberCount', { count }))).toEqual([
      '0 miembros', '1 miembro', '2 miembros',
    ]);
    expect(i18n.getFixedT('fr')('sharedAccount.memberCount', { count: 0 })).toBe('0 membres');
    expect(i18n.getFixedT('pt')('sharedAccount.memberCount', { count: 0 })).toBe('0 membros');
    expect(i18n.getFixedT('de')('home.movementCount', { count: 1 })).toBe(de.home.movementCount_one.replace('{{count}}', '1'));
  });
});
