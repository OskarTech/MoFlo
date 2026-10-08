import i18n from '../i18n';
import {
  BusinessConfig, BusinessMode, Catalog, Channel, ChannelKind, ConfigItem, ExpenseType, SalesMethod, TemplateId,
} from './types';

/**
 * Plantillas: lo que se rellena al crear la empresa (formas de cobro, tipos
 * de gasto, cajas, turnos y una carta de ejemplo), en el idioma de quien la
 * crea. Es solo el punto de partida: después todo se cambia en Empresa.
 */

export interface TemplateInfo {
  id: TemplateId;
  icon: string;
  mode: BusinessMode;
  salesMethod: SalesMethod;
  /** 0 domingo … 6 sábado */
  openDays: number[];
  dayCutoffHour: number;
  cashCount: boolean;
  /** Las formas de cobro que salen marcadas al crearla */
  channels: TemplateChannel[];
}

export type TemplateChannel = 'cash' | 'card' | 'instant' | 'platform0' | 'platform1' | 'platform2' | 'transfer';

export const TEMPLATES: TemplateInfo[] = [
  {
    id: 'pizzeria', icon: 'pizza', mode: 'expert', salesMethod: 'orders',
    openDays: [0, 2, 3, 4, 5, 6], dayCutoffHour: 4, cashCount: true,
    channels: ['cash', 'card', 'instant', 'platform0', 'platform1'],
  },
  {
    id: 'bar', icon: 'cafe', mode: 'simple', salesMethod: 'orders',
    openDays: [0, 1, 2, 3, 4, 5, 6], dayCutoffHour: 4, cashCount: true,
    channels: ['cash', 'card', 'instant'],
  },
  {
    id: 'restaurant', icon: 'restaurant', mode: 'expert', salesMethod: 'orders',
    openDays: [0, 2, 3, 4, 5, 6], dayCutoffHour: 4, cashCount: true,
    channels: ['cash', 'card', 'instant', 'platform0'],
  },
  {
    id: 'shop', icon: 'cart', mode: 'expert', salesMethod: 'tills',
    openDays: [1, 2, 3, 4, 5, 6], dayCutoffHour: 0, cashCount: true,
    channels: ['cash', 'card'],
  },
  {
    id: 'services', icon: 'cut', mode: 'simple', salesMethod: 'orders',
    openDays: [1, 2, 3, 4, 5, 6], dayCutoffHour: 0, cashCount: false,
    channels: ['cash', 'card', 'instant'],
  },
  {
    id: 'blank', icon: 'document-text', mode: 'simple', salesMethod: 'tills',
    openDays: [0, 1, 2, 3, 4, 5, 6], dayCutoffHour: 0, cashCount: false,
    channels: ['cash', 'card'],
  },
];

export const templateInfo = (id: TemplateId): TemplateInfo => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[TEMPLATES.length - 1];

/**
 * Las que se pueden elegir al crear una empresa. De momento, solo pizzería y
 * supermercado: las demás mezclaban cosas que no eran suyas (los extras de la
 * carta en una peluquería). Siguen aquí para las empresas ya creadas con ellas
 */
export const CREATABLE_TEMPLATES = TEMPLATES.filter((t) => t.id === 'pizzeria' || t.id === 'shop');

const t = (key: string, options?: Record<string, unknown>) => i18n.t(`business.tpl.${key}`, options);

/** Las plataformas de reparto y el pago al momento del país del idioma (Glovo, Bizum…) */
export const localPayments = () => {
  // «-»: en ese idioma no hay (ni pago al momento ni plataformas)
  const usable = (value: string) => !!value && value !== '-' && !value.startsWith('business.');
  const platforms = String(t('platforms')).split('|').map((p) => p.trim()).filter(usable);
  const instantRaw = String(t('instantPay')).trim();
  return { platforms, instant: usable(instantRaw) ? instantRaw : '' };
};

/** Las formas de cobro que se pueden elegir al crear la empresa, con su nombre */
export const channelChoices = (): { key: TemplateChannel; name: string; kind: ChannelKind; commissionPct?: number }[] => {
  const { platforms, instant } = localPayments();
  const list: { key: TemplateChannel; name: string; kind: ChannelKind; commissionPct?: number }[] = [
    { key: 'cash', name: t('channels.cash'), kind: 'cash' },
    { key: 'card', name: t('channels.card'), kind: 'card' },
  ];
  if (instant) list.push({ key: 'instant', name: instant, kind: 'other' });
  platforms.slice(0, 3).forEach((name, i) => {
    list.push({ key: `platform${i}` as TemplateChannel, name, kind: 'other', commissionPct: 30 });
  });
  list.push({ key: 'transfer', name: t('channels.transfer'), kind: 'other' });
  return list;
};

const items = (names: string[]): Record<string, ConfigItem> =>
  Object.fromEntries(names.map((name, i) => [`i${i + 1}`, { name, order: i + 1 }]));

/** Los tipos de gasto: los mismos en todas las plantillas, con ids fijos */
export const EXPENSE_TYPE_IDS = ['suppliers', 'payroll', 'rent', 'utilities', 'commissions', 'taxes', 'other'] as const;
const EXPENSE_TYPE_ICONS: Record<(typeof EXPENSE_TYPE_IDS)[number], string> = {
  suppliers: 'cart', payroll: 'people', rent: 'home', utilities: 'water',
  commissions: 'card', taxes: 'document-text', other: 'pricetag',
};
/** Al cerrar el día, la comisión de cada forma de cobro se apunta con este tipo */
export const COMMISSIONS_TYPE = 'commissions';

const expenseTypes = (): Record<string, ExpenseType> => Object.fromEntries(
  EXPENSE_TYPE_IDS.map((id, i) => [id, { name: t(`expenseTypes.${id}`), icon: EXPENSE_TYPE_ICONS[id], order: i + 1 }]),
);

export interface CreateConfigInput {
  template: TemplateId;
  mode: BusinessMode;
  salesMethod: SalesMethod;
  channels: TemplateChannel[];
  workers: string[];
}

/** La configuración con la que nace la empresa */
export const buildConfig = ({ template, mode, salesMethod, channels, workers }: CreateConfigInput): BusinessConfig => {
  const info = templateInfo(template);
  const choices = channelChoices();
  const chosen = choices.filter((c) => channels.includes(c.key));
  const channelMap: Record<string, Channel> = Object.fromEntries(chosen.map((c, i) => [
    c.key,
    { name: c.name, kind: c.kind, order: i + 1, ...(c.commissionPct ? { commissionPct: c.commissionPct } : {}) },
  ]));
  if (!Object.keys(channelMap).length) channelMap.cash = { name: t('channels.cash'), kind: 'cash', order: 1 };

  const workerNames = workers.map((w) => w.trim()).filter(Boolean);
  const shop = template === 'shop';
  return {
    mode,
    salesMethod,
    channels: channelMap,
    workers: Object.fromEntries(workerNames.map((name, i) => [`w${i + 1}`, { name, order: i + 1 }])),
    suppliers: {},
    expenseTypes: expenseTypes(),
    sections: shop ? items([t('sections.grocery'), t('sections.produce'), t('sections.butcher'), t('sections.bakery'), t('sections.household')]) : {},
    tills: shop ? items([t('till', { n: 1 }), t('till', { n: 2 })]) : {},
    shifts: shop
      ? items([t('shifts.morning'), t('shifts.afternoon')])
      : template === 'restaurant' ? items([t('shifts.lunch'), t('shifts.dinner')]) : {},
    openDays: info.openDays,
    dayCutoffHour: info.dayCutoffHour,
    cashCount: info.cashCount,
    floatAmount: shop ? 150 : 100,
    spreadFixed: true,
    notifyOnClose: true,
  };
};

// ── Cartas de ejemplo ────────────────────────────────────────────

interface SampleProduct { key: string; cat: string; price?: number; sizes?: [string, number][] }
interface SampleExtra { key: string; price: number; cats?: string[] }
interface SampleCatalog { categories: string[]; products: SampleProduct[]; extras: SampleExtra[] }

const SAMPLES: Partial<Record<TemplateId, SampleCatalog>> = {
  pizzeria: {
    categories: ['pizzas', 'drinks', 'desserts'],
    products: [
      { key: 'margherita', cat: 'pizzas', sizes: [['medium', 8.5], ['family', 13]] },
      { key: 'bbq', cat: 'pizzas', sizes: [['medium', 9.5], ['family', 14.5]] },
      { key: 'hamCheese', cat: 'pizzas', sizes: [['medium', 9], ['family', 14]] },
      { key: 'fourCheese', cat: 'pizzas', sizes: [['medium', 10], ['family', 15]] },
      { key: 'diavola', cat: 'pizzas', sizes: [['medium', 9.5], ['family', 14.5]] },
      { key: 'veggie', cat: 'pizzas', sizes: [['medium', 9], ['family', 14]] },
      { key: 'softDrink', cat: 'drinks', price: 2 },
      { key: 'water', cat: 'drinks', price: 1.5 },
      { key: 'beer', cat: 'drinks', price: 2.5 },
      { key: 'tiramisu', cat: 'desserts', price: 4 },
      { key: 'coulant', cat: 'desserts', price: 4.5 },
    ],
    extras: [
      { key: 'cheese', price: 1, cats: ['pizzas'] },
      { key: 'bacon', price: 1.5, cats: ['pizzas'] },
      { key: 'mushrooms', price: 1, cats: ['pizzas'] },
      { key: 'stuffedCrust', price: 2, cats: ['pizzas'] },
    ],
  },
  bar: {
    categories: ['coffees', 'drinks', 'tapas', 'sandwiches'],
    products: [
      { key: 'coffee', cat: 'coffees', price: 1.3 },
      { key: 'coffeeMilk', cat: 'coffees', price: 1.5 },
      { key: 'smallBeer', cat: 'drinks', price: 1.8 },
      { key: 'softDrink', cat: 'drinks', price: 2 },
      { key: 'water', cat: 'drinks', price: 1.5 },
      { key: 'wineGlass', cat: 'drinks', price: 2.5 },
      { key: 'bravas', cat: 'tapas', price: 5 },
      { key: 'tortilla', cat: 'tapas', price: 3 },
      { key: 'hamSandwich', cat: 'sandwiches', price: 4.5 },
    ],
    extras: [
      { key: 'plantMilk', price: 0.3, cats: ['coffees'] },
      { key: 'extraCheese', price: 0.5, cats: ['sandwiches'] },
    ],
  },
  restaurant: {
    categories: ['menu', 'starters', 'mains', 'desserts', 'drinks'],
    products: [
      { key: 'dailyMenu', cat: 'menu', price: 13.5 },
      { key: 'salad', cat: 'starters', price: 8 },
      { key: 'croquettes', cat: 'starters', price: 7.5 },
      { key: 'paella', cat: 'mains', price: 14 },
      { key: 'steak', cat: 'mains', price: 19 },
      { key: 'homeDessert', cat: 'desserts', price: 4.5 },
      { key: 'water', cat: 'drinks', price: 1.8 },
      { key: 'wineGlass', cat: 'drinks', price: 3 },
      { key: 'softDrink', cat: 'drinks', price: 2.5 },
    ],
    extras: [
      { key: 'bread', price: 1 },
    ],
  },
  services: {
    categories: ['services', 'products'],
    products: [
      { key: 'cut', cat: 'services', price: 15 },
      { key: 'cutStyle', cat: 'services', price: 22 },
      { key: 'dye', cat: 'services', price: 38 },
      { key: 'highlights', cat: 'services', price: 65 },
      { key: 'shampoo', cat: 'products', price: 16 },
    ],
    extras: [
      { key: 'treatment', price: 10, cats: ['services'] },
    ],
  },
};

/** La carta con la que nace la empresa (vacía en las plantillas sin carta) */
export const buildCatalog = (template: TemplateId): Catalog => {
  const sample = SAMPLES[template];
  if (!sample) return { categories: {}, products: {}, extras: {} };
  const categories = Object.fromEntries(sample.categories.map((key, i) => [
    `c_${key}`, { name: t(`categories.${key}`), order: i + 1 },
  ]));
  const products = Object.fromEntries(sample.products.map((p, i) => [
    `p_${p.key}`,
    {
      name: t(`products.${p.key}`),
      categoryId: `c_${p.cat}`,
      order: i + 1,
      ...(p.sizes
        ? {
          sizes: Object.fromEntries(p.sizes.map(([size, price], j) => [
            `s_${size}`, { name: t(`sizes.${size}`), price, order: j + 1 },
          ])),
        }
        : { price: p.price ?? 0 }),
    },
  ]));
  const extras = Object.fromEntries(sample.extras.map((e, i) => [
    `x_${e.key}`,
    {
      name: t(`extras.${e.key}`),
      price: e.price,
      order: i + 1,
      ...(e.cats ? { categoryIds: e.cats.map((c) => `c_${c}`) } : {}),
    },
  ]));
  return { categories, products, extras };
};
