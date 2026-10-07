import type { ColorPaletteId } from '../theme';

/**
 * La cuenta de empresa: los números de un negocio pequeño para control propio
 * (sin facturas ni Verifactu). Va en su propia colección, `businesses/{id}`,
 * aparte de la cuenta individual y la compartida (ver firestore.rules).
 *
 * Lo que se cambia por partes (formas de cobro, carta, cajas de un día) va en
 * mapas por id: cada cambio toca solo su campo, así dos socios no se pisan,
 * tampoco sin conexión.
 */

/** Sencillo: el total del día. Experto: por caja o pedido a pedido */
export type BusinessMode = 'simple' | 'expert';
/** Cómo se apuntan las ventas en Experto */
export type SalesMethod = 'tills' | 'orders';

export type TemplateId = 'pizzeria' | 'bar' | 'restaurant' | 'shop' | 'services' | 'blank';

/** Socios: 5 como mucho (también en las reglas) */
export const MAX_BUSINESS_MEMBERS = 5;

export interface Business {
  id: string;
  name: string;
  createdBy: string;
  members: string[];
  memberNames: Record<string, string>;
  inviteCode: string;
  createdAt: string;
  template: TemplateId;
  currencyCode: string;
  colorPalette?: ColorPaletteId;
}

/** Una pieza de la configuración: forma de cobro, empleado, proveedor… */
export interface ConfigItem {
  name: string;
  order: number;
  /** Archivada: ya no sale al apuntar, pero sigue en lo de antes */
  archived?: boolean;
}

export type ChannelKind = 'cash' | 'card' | 'other';

export interface Channel extends ConfigItem {
  kind: ChannelKind;
  /** Lo que se queda la plataforma (Glovo, el banco del TPV…), en %. Se apunta sola como gasto al cerrar */
  commissionPct?: number;
}

export interface Worker extends ConfigItem {
  role?: string;
}

export interface Supplier extends ConfigItem {
  /** Tipo de gasto que se propone al apuntar una factura suya */
  typeId?: string;
}

export interface ExpenseType extends ConfigItem {
  icon: string;
}

export type ConfigListKind = 'channels' | 'workers' | 'suppliers' | 'expenseTypes' | 'sections' | 'tills' | 'shifts';

export interface BusinessConfig {
  mode: BusinessMode;
  salesMethod: SalesMethod;
  channels: Record<string, Channel>;
  workers: Record<string, Worker>;
  suppliers: Record<string, Supplier>;
  expenseTypes: Record<string, ExpenseType>;
  /** Secciones del ticket Z (fruta, carnicería…) */
  sections: Record<string, ConfigItem>;
  tills: Record<string, ConfigItem>;
  shifts: Record<string, ConfigItem>;
  /** Días que abre (0 domingo … 6 sábado): entre ellos se reparten los fijos */
  openDays: number[];
  /** Lo apuntado antes de esta hora cuenta para el día anterior (un bar que cierra a las 2) */
  dayCutoffHour: number;
  /** Arqueo: fondo de caja y efectivo contado, para ver el descuadre */
  cashCount: boolean;
  /** Fondo de caja que se propone */
  floatAmount: number;
  /** Repartir los fijos entre los días que abre, en el día a día */
  spreadFixed: boolean;
  /** Aviso a los demás socios al cerrar el día */
  notifyOnClose: boolean;
}

// ── La carta ─────────────────────────────────────────────────────

export interface ProductSize {
  name: string;
  price: number;
  order: number;
  archived?: boolean;
}

export interface Product extends ConfigItem {
  categoryId: string;
  /** Precio sin tamaños */
  price?: number;
  /** Con tamaños (mediana, familiar…), cada uno con su precio */
  sizes?: Record<string, ProductSize>;
}

/** Ingrediente extra o complemento con su precio. Sin categorías, vale para todo */
export interface CatalogExtra extends ConfigItem {
  price: number;
  categoryIds?: string[];
}

export interface Catalog {
  categories: Record<string, ConfigItem>;
  products: Record<string, Product>;
  extras: Record<string, CatalogExtra>;
}

// ── Los pedidos ──────────────────────────────────────────────────

/** Un extra de una línea, con su precio por unidad de ese momento */
export interface OrderExtra {
  extraId?: string | null;
  name: string;
  price: number;
}

/**
 * Una línea de un pedido. Lleva la copia del nombre, el tamaño y el precio de
 * ese momento: si mañana cambia la carta, lo vendido no cambia. Los resúmenes
 * agrupan por los ids, así que renombrar un producto no parte sus ventas.
 */
export interface OrderLine {
  key: string;
  productId?: string | null;
  categoryId?: string | null;
  name: string;
  sizeId?: string | null;
  sizeName?: string | null;
  unitPrice: number;
  qty: number;
  extras?: OrderExtra[];
}

export type OrderStatus = 'ok' | 'void';

export interface Order {
  id: string;
  /** Día del negocio (AAAA-MM-DD) */
  day: string;
  /** Cuándo se apuntó (ISO) */
  at: string;
  lines: OrderLine[];
  total: number;
  channelId: string;
  channelName: string;
  /** Los pedidos no se borran: se anulan, y queda quién y cuándo */
  status: OrderStatus;
  voidedBy?: string | null;
  voidedAt?: string | null;
  by: string;
  note?: string;
  /** Hora del servidor de su último cambio, en ms */
  updatedAt?: number;
}

// ── Los días ─────────────────────────────────────────────────────

export type DayStatus = 'open' | 'closing' | 'closed';

export interface ManualAmount {
  id: string;
  name: string;
  amount: number;
}

/**
 * Lo apuntado de una caja, un turno o el día entero: lo cobrado por cada
 * forma de cobro, con la copia de sus nombres
 */
export interface DayEntry {
  id: string;
  workerId?: string | null;
  workerName?: string | null;
  tillId?: string | null;
  tillName?: string | null;
  shiftId?: string | null;
  shiftName?: string | null;
  amounts: Record<string, number>;
  channelNames: Record<string, string>;
  /** Lo que no es de ninguna forma de cobro, escrito a mano */
  manual?: ManualAmount[];
  tickets?: number | null;
  sections?: Record<string, number>;
  sectionNames?: Record<string, string>;
  /** Arqueo: fondo de caja y efectivo contado */
  float?: number | null;
  counted?: number | null;
  /** El cierre de un día de pedidos: se rellena con ellos */
  fromOrders?: boolean;
  note?: string;
  by: string;
  at: string;
}

export interface SoldItem {
  name: string;
  qty: number;
  amount: number;
  categoryId?: string | null;
}

/** Lo vendido en los pedidos de un día, guardado al cerrarlo */
export interface OrdersSummary {
  count: number;
  voided: number;
  total: number;
  byChannel: Record<string, number>;
  channelNames: Record<string, string>;
  /** Por producto y tamaño */
  items: Record<string, SoldItem>;
  extras: Record<string, SoldItem>;
  /** Unidades de cada tamaño, por su nombre */
  sizes: Record<string, number>;
  /** Pedidos por hora (0-23) */
  hours: Record<string, number>;
}

export interface BusinessDay {
  /** AAAA-MM-DD */
  id: string;
  status: DayStatus;
  entries: Record<string, DayEntry>;
  ordersSummary?: OrdersSummary | null;
  closedBy?: string | null;
  closedAt?: string | null;
  reopenedBy?: string | null;
  reopenedAt?: string | null;
  updatedAt?: number;
}

// ── Gastos y fijos ───────────────────────────────────────────────

export interface BusinessExpense {
  id: string;
  /** AAAA-MM-DD */
  date: string;
  amount: number;
  /** El concepto («Alquiler», «Factura 2381»); sin él se enseña el proveedor o el tipo */
  name?: string;
  typeId: string;
  typeName: string;
  supplierId?: string | null;
  supplierName?: string | null;
  workerId?: string | null;
  workerName?: string | null;
  note?: string;
  /** El fijo del que sale, si sale de uno */
  recurringId?: string | null;
  by: string;
  createdAt: string;
  updatedAt?: number;
}

export interface BusinessRecurring {
  id: string;
  name: string;
  amount: number;
  typeId: string;
  typeName: string;
  supplierId?: string | null;
  supplierName?: string | null;
  workerId?: string | null;
  workerName?: string | null;
  /** Día del mes (1-31; si el mes no lo tiene, el último) */
  day: number;
  active: boolean;
  /** Meses (AAAA-MM) en los que se borró su gasto: no se vuelve a crear */
  skipped?: string[];
  by: string;
  createdAt: string;
  updatedAt?: number;
}

// ── Historial ────────────────────────────────────────────────────

export type ChangeKind = 'order' | 'day' | 'entry' | 'expense' | 'recurring';
export type ChangeAction = 'void' | 'edit' | 'delete' | 'reopen' | 'close';

/** Una línea del historial de cambios: solo se añaden, nunca se tocan */
export interface BusinessChange {
  id: string;
  kind: ChangeKind;
  action: ChangeAction;
  targetId: string;
  /** El día al que afecta (AAAA-MM-DD), si afecta a uno */
  day?: string | null;
  /** Lo que había antes */
  before?: Record<string, unknown> | null;
  by: string;
  byName: string;
  at: string;
}

// ── Socios ───────────────────────────────────────────────────────

export interface BusinessJoinRequest {
  uid: string;
  displayName: string;
  status: 'pending' | 'rejected';
  requestedAt: string;
}

export interface PendingBusinessRequest {
  businessId: string;
  businessName: string;
  status: 'pending' | 'rejected';
  requestedAt: string;
}
