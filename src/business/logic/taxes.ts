import { BusinessConfig, BusinessDay, BusinessExpense, DayEntry } from '../types';
import { DEFAULT_CORPORATE_TAX, DEFAULT_SALES_VAT, EXPENSE_TYPES, expenseRole } from '../templates';
import { cents, sumOf } from './basics';
import { dayEntries, entryTotal } from './days';

/**
 * El beneficio real, aproximado, para verlo de un vistazo (no es contabilidad).
 *
 * Lo cobrado lleva IVA, y ese dinero no es de la empresa: se paga a Hacienda
 * cada trimestre (el 303), restando el IVA de los gastos. Así que aquí lo
 * vendido y lo gastado van sin IVA, y a lo que queda se le resta el impuesto
 * de sociedades estimado. Los pagos del IVA y del impuesto de sociedades no
 * cuentan como gasto: ya están en la cuenta.
 *
 * El IVA de lo vendido sale del que manda la caja; en lo apuntado a mano, del
 * de la configuración. El de cada gasto, el de su factura si se escribió
 * aparte y, si no, el de su tipo. Los dos impuestos se pueden quitar en
 * Ajustes: sin IVA, todo cuenta entero; sin sociedades, no se estima nada.
 */

export interface TaxEstimate {
  /** Lo vendido sin IVA */
  salesBase: number;
  /** El IVA de lo vendido (no es de la empresa) */
  salesVat: number;
  /** Lo gastado sin IVA, sin los pagos de impuestos */
  expensesBase: number;
  /** El IVA de los gastos, que se descuenta en el 303 */
  expensesVat: number;
  /** Lo que tocaría pagar con el 303: el IVA de lo vendido menos el de los gastos */
  vatToPay: number;
  /** Lo vendido menos lo gastado, sin IVA */
  profitBeforeTax: number;
  /** El impuesto de sociedades estimado (sobre el beneficio, si lo hay) */
  corporateTax: number;
  /** Lo que queda de verdad */
  realProfit: number;
}

const DEFAULT_EXPENSE_RATES: Record<string, number> = Object.fromEntries(EXPENSE_TYPES.map((x) => [x.id, x.vatRate]));

type TaxConfig = Pick<BusinessConfig,
  'expenseTypes' | 'vatEnabled' | 'salesVatRate' | 'corporateTaxEnabled' | 'corporateTaxRate'>;

/**
 * Los pagos que son impuestos sobre lo ya calculado (el IVA, el de
 * sociedades): no son gasto en el beneficio real, si ese impuesto se calcula
 */
export const isTaxPayment = (expense: Pick<BusinessExpense, 'typeId'>, config: TaxConfig): boolean => {
  const role = expenseRole(expense.typeId, config);
  return (role === 'vat' && config.vatEnabled !== false)
    || (role === 'corporateTax' && config.corporateTaxEnabled !== false);
};

/** El IVA de lo vendido en una entrada */
export const entrySalesVat = (entry: Pick<DayEntry, 'amounts' | 'manual' | 'vat'>, defaultRate: number): number => {
  const sales = entryTotal(entry);
  if (!sales) return 0;
  const lines = entry.vat ?? [];
  const base = sumOf(lines, (l) => l.base);
  const vat = sumOf(lines, (l) => l.vat);
  // Con lo que manda la caja, la parte de IVA de lo vendido (lo pendiente de
  // cobrar va en su IVA, pero no en lo vendido)
  if (base + vat > 0) return cents((sales * vat) / (base + vat));
  return cents(sales - sales / (1 + defaultRate / 100));
};

/** El IVA que suele llevar un tipo de gasto */
export const expenseVatRate = (typeId: string, config: Pick<BusinessConfig, 'expenseTypes'>): number =>
  config.expenseTypes?.[typeId]?.vatRate ?? DEFAULT_EXPENSE_RATES[typeId] ?? 0;

/** El IVA de un importe sin IVA */
export const vatOfBase = (base: number, rate: number): number => cents((base * rate) / 100);

/**
 * Lo pagado partido en base e IVA: con el IVA de la factura, si se escribió
 * aparte, o con el del tipo. La base y el IVA suman siempre lo pagado
 */
export const splitAmount = (amount: number, vat: number | null | undefined, rate: number): { base: number; vat: number } => {
  if (typeof vat === 'number') return { base: cents(amount - vat), vat };
  const base = rate > 0 ? cents(amount / (1 + rate / 100)) : amount;
  return { base, vat: cents(amount - base) };
};

/** El beneficio real de los días y gastos que se le pasen (un mes, un trimestre) */
export const taxEstimate = (
  days: readonly (BusinessDay | null | undefined)[],
  expenses: readonly BusinessExpense[],
  config: TaxConfig,
): TaxEstimate => {
  const withVat = config.vatEnabled !== false;
  const salesRate = config.salesVatRate ?? DEFAULT_SALES_VAT;
  const taxRate = config.corporateTaxEnabled === false ? 0 : (config.corporateTaxRate ?? DEFAULT_CORPORATE_TAX);
  let sales = 0;
  let salesVat = 0;
  for (const day of days) {
    for (const entry of dayEntries(day)) {
      sales = cents(sales + entryTotal(entry));
      if (withVat) salesVat = cents(salesVat + entrySalesVat(entry, salesRate));
    }
  }
  let expensesBase = 0;
  let expensesVat = 0;
  for (const e of expenses) {
    if (isTaxPayment(e, config)) continue;
    const rate = withVat ? expenseVatRate(e.typeId, config) : 0;
    const written = withVat && typeof e.vat === 'number' ? e.vat : null;
    const base = written != null ? e.amount - written : rate > 0 ? e.amount / (1 + rate / 100) : e.amount;
    expensesBase = cents(expensesBase + base);
    expensesVat = cents(expensesVat + (e.amount - base));
  }
  const salesBase = cents(sales - salesVat);
  const profitBeforeTax = cents(salesBase - expensesBase);
  const corporateTax = profitBeforeTax > 0 ? cents((profitBeforeTax * taxRate) / 100) : 0;
  return {
    salesBase,
    salesVat,
    expensesBase,
    expensesVat,
    vatToPay: cents(salesVat - expensesVat),
    profitBeforeTax,
    corporateTax,
    realProfit: cents(profitBeforeTax - corporateTax),
  };
};

/** El trimestre de un mes (0-11): sus tres meses */
export const quarterMonths = (month0: number): number[] => {
  const first = Math.floor(month0 / 3) * 3;
  return [first, first + 1, first + 2];
};
