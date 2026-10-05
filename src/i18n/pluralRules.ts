// iOS (Hermes) no trae Intl.PluralRules. Sin él, i18next usa en todos los
// idiomas «one» con 1 y «other» para lo demás, y en polaco salía mal todo lo
// que no fuera 1 («2 członka», «2 transakcji»): sus formas few y many no se
// usaban nunca. Aquí va uno mínimo, solo si falta: el polaco con sus reglas
// (las de CLDR) y el resto de idiomas exactamente como hasta ahora

type Category = 'one' | 'few' | 'many' | 'other';

// Polaco: 1, one; acabados en 2-4 salvo 12-14, few; el resto de enteros
// (0, 5-21, 25-31…), many; con decimales, other
export const polishCategory = (n: number): Category => {
  if (!Number.isInteger(n)) return 'other';
  const i = Math.abs(n);
  if (i === 1) return 'one';
  const lastDigit = i % 10;
  const lastTwo = i % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'few';
  return 'many';
};

export class MinimalPluralRules {
  private readonly locale: string;
  private readonly type: 'cardinal' | 'ordinal';
  private readonly polish: boolean;

  constructor(locales?: string | string[], options?: { type?: 'cardinal' | 'ordinal' }) {
    const first = Array.isArray(locales) ? locales[0] : locales;
    this.locale = typeof first === 'string' && first ? first : 'en';
    this.type = options?.type === 'ordinal' ? 'ordinal' : 'cardinal';
    this.polish = this.type === 'cardinal' && this.locale.toLowerCase().split(/[-_]/)[0] === 'pl';
  }

  select(n: number): Category {
    if (this.polish) return polishCategory(Number(n));
    // La regla de reserva de i18next, la que se usaba hasta ahora
    return n === 1 ? 'one' : 'other';
  }

  resolvedOptions() {
    return {
      locale: this.locale,
      type: this.type,
      pluralCategories: this.polish ? ['one', 'few', 'many', 'other'] : ['one', 'other'],
    };
  }

  static supportedLocalesOf(locales?: string | string[]): string[] {
    return locales === undefined ? [] : ([] as string[]).concat(locales);
  }
}

// Antes de iniciar i18next. Si el sistema ya lo trae (Android, Node), no se toca
export const installPluralRules = (): void => {
  const intl = (globalThis as { Intl?: Record<string, unknown> }).Intl;
  if (!intl || typeof intl.PluralRules === 'function') return;
  intl.PluralRules = MinimalPluralRules;
};
