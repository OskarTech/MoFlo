import i18n from '../i18n';
import { BusinessConfig, Channel, ExpenseRole, ExpenseType } from './types';

/**
 * Lo que se rellena al crear la empresa, que es siempre una pizzería: sus
 * formas de cobro, sus tipos de gasto y las opciones de partida, en el idioma
 * de quien la crea. Después todo se cambia en Ajustes.
 */

const t = (key: string, options?: Record<string, unknown>) => i18n.t(`business.tpl.${key}`, options);

/** El icono de la empresa */
export const BUSINESS_ICON = 'pizza';

/**
 * Las formas de cobro, con ids fijos: son los de la caja (byPayment). Online
 * es lo cobrado en la web (Stripe)
 */
export const CHANNEL_IDS = ['cash', 'card', 'online'] as const;

/** Los tipos de gasto, con ids fijos, su icono, el IVA que suelen llevar y para qué cuentan */
export const EXPENSE_TYPES: { id: string; icon: string; vatRate: number; role?: ExpenseRole }[] = [
  { id: 'ingredients', icon: 'basket', vatRate: 10, role: 'food' },
  { id: 'drinks', icon: 'beer', vatRate: 10, role: 'food' },
  { id: 'packaging', icon: 'bag', vatRate: 21 },
  { id: 'payroll', icon: 'people', vatRate: 0, role: 'staff' },
  { id: 'socialSecurity', icon: 'shield-checkmark', vatRate: 0, role: 'staff' },
  { id: 'rent', icon: 'home', vatRate: 21 },
  { id: 'electricity', icon: 'flash', vatRate: 21 },
  { id: 'water', icon: 'water', vatRate: 10 },
  { id: 'gas', icon: 'flame', vatRate: 21 },
  { id: 'phone', icon: 'phone-portrait', vatRate: 21 },
  { id: 'commissions', icon: 'card', vatRate: 0 },
  { id: 'vat', icon: 'receipt', vatRate: 0, role: 'vat' },
  { id: 'corporateTax', icon: 'business', vatRate: 0, role: 'corporateTax' },
  { id: 'taxes', icon: 'document-text', vatRate: 0 },
  { id: 'insurance', icon: 'umbrella', vatRate: 0 },
  { id: 'loan', icon: 'cash', vatRate: 0 },
  { id: 'maintenance', icon: 'construct', vatRate: 21 },
  { id: 'equipment', icon: 'restaurant', vatRate: 21 },
  { id: 'marketing', icon: 'megaphone', vatRate: 21 },
  { id: 'other', icon: 'pricetag', vatRate: 21 },
];

/** Al cerrar el día, la comisión de cada forma de cobro se apunta con este tipo */
export const COMMISSIONS_TYPE = 'commissions';
/** Lo que se apunta al pagar el IVA (el 303) y el impuesto de sociedades */
export const VAT_TYPE = 'vat';
export const CORPORATE_TAX_TYPE = 'corporateTax';

const DEFAULT_ROLES: Record<string, ExpenseRole> = Object.fromEntries(
  EXPENSE_TYPES.filter((x) => x.role).map((x) => [x.id, x.role as ExpenseRole]),
);

/** Para qué cuenta un tipo de gasto: lo que diga en Ajustes o, si nunca se ha tocado, lo de la plantilla */
export const expenseRole = (typeId: string, config: Pick<BusinessConfig, 'expenseTypes'>): ExpenseRole =>
  config.expenseTypes?.[typeId]?.role ?? DEFAULT_ROLES[typeId] ?? 'none';

/** El tipo que se propone al apuntar un gasto o un proveedor */
export const DEFAULT_EXPENSE_TYPE = 'ingredients';
/** Los que suelen ser fijos: al apuntar un fijo, delante de los que aún no se han usado */
export const USUALLY_FIXED_TYPES = [
  'rent', 'payroll', 'socialSecurity', 'electricity', 'water', 'gas', 'phone', 'insurance', 'loan', 'taxes',
];

/** El IVA de lo que se vende en la pizzería (comida preparada) */
export const DEFAULT_SALES_VAT = 10;
/** El impuesto de sociedades de una sociedad nueva: 15 % los dos primeros años con beneficio */
export const DEFAULT_CORPORATE_TAX = 15;
/** Lo que se suele buscar en hostelería: materia prima y personal, en % de lo vendido */
export const DEFAULT_FOOD_TARGET = 30;
export const DEFAULT_STAFF_TARGET = 35;
/** Stripe, con tarjetas europeas normales: 1,5 % más 0,25 € por cobro (stripe.com/es/pricing) */
const STRIPE_PCT = 1.5;
const STRIPE_FIXED = 0.25;
/** El IVA que se supone a un tipo de gasto nuevo */
export const DEFAULT_EXPENSE_VAT = 21;

const channels = (): Record<string, Channel> => ({
  cash: { name: t('channels.cash'), kind: 'cash', order: 1 },
  card: { name: t('channels.card'), kind: 'card', order: 2 },
  online: { name: t('channels.online'), kind: 'other', order: 3, commissionPct: STRIPE_PCT, commissionFixed: STRIPE_FIXED },
});

const expenseTypes = (): Record<string, ExpenseType> => Object.fromEntries(
  EXPENSE_TYPES.map((x, i) => [x.id, {
    name: t(`expenseTypes.${x.id}`), icon: x.icon, vatRate: x.vatRate, role: x.role ?? 'none', order: i + 1,
  }]),
);

/** La configuración con la que nace la empresa */
export const buildConfig = (): BusinessConfig => ({
  channels: channels(),
  workers: {},
  suppliers: {},
  expenseTypes: expenseTypes(),
  openDays: [0, 2, 3, 4, 5, 6],
  dayCutoffHour: 4,
  cashCount: true,
  floatAmount: 100,
  spreadFixed: true,
  notifyOnClose: true,
  vatEnabled: true,
  salesVatRate: DEFAULT_SALES_VAT,
  corporateTaxEnabled: true,
  corporateTaxRate: DEFAULT_CORPORATE_TAX,
  foodCostTarget: DEFAULT_FOOD_TARGET,
  staffCostTarget: DEFAULT_STAFF_TARGET,
});
