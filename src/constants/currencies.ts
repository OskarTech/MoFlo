export interface Currency {
  code: string;
  symbol: string;
  label: string;
  /** El símbolo va delante del importe ($12,50, CHF 12,50); sin esto, detrás (12,50 €) */
  symbolBefore?: boolean;
}

export const CURRENCIES: Currency[] = [
  { code: 'EUR', symbol: '€', label: 'Euro (€)' },
  { code: 'USD', symbol: '$', label: 'Dollar ($)', symbolBefore: true },
  { code: 'GBP', symbol: '£', label: 'Pound (£)', symbolBefore: true },
  { code: 'PLN', symbol: 'zł', label: 'Złoty (zł)' },
  { code: 'CHF', symbol: 'CHF', label: 'Franc (CHF)', symbolBefore: true },
  { code: 'MXN', symbol: 'MX$', label: 'Peso (MX$)', symbolBefore: true },
];
