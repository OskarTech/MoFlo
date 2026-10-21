import type { ColorPaletteId } from '../theme';

/**
 * La cuenta de empresa: los números de una pizzería para control propio (sin
 * facturas: los tickets los hace su caja). Va en su propia colección,
 * `businesses/{id}`, aparte de la cuenta individual y la compartida (ver
 * firestore.rules), y solo la ven las cuentas de la lista (ver access.ts).
 *
 * Lo vendido cada día llega solo de la caja de la pizzería (la entrada `pos`,
 * que escribe el servidor) y se puede apuntar a mano. Lo que se cambia por
 * partes (formas de cobro, entradas de un día) va en mapas por id: cada cambio
 * toca solo su campo, así dos socios no se pisan, tampoco sin conexión.
 */

/** Solo pizzería: se guarda en la empresa por si algún día hay otras */
export type TemplateId = 'pizzeria';

/** Socios: 5 como mucho (también en las reglas) */
export const MAX_BUSINESS_MEMBERS = 5;

/** La entrada del día que manda la caja (y quien la firma): solo la escribe el servidor */
export const POS_ENTRY_ID = 'pos';
export const POS_ACTOR = 'pos';

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
  /** Lo que se queda el banco o la plataforma (el datáfono, Stripe), en %. Se apunta sola como gasto */
  commissionPct?: number;
  /** Lo fijo por cada cobro (Stripe: 0,25 €). Solo cuenta si la caja dice cuántos cobros hubo */
  commissionFixed?: number;
}

export interface Worker extends ConfigItem {
  role?: string;
}

export interface Supplier extends ConfigItem {
  /** Tipo de gasto que se propone al apuntar una factura suya */
  typeId?: string;
}

/**
 * Para qué cuenta un tipo de gasto: materia prima o personal (sus % sobre lo
 * vendido), o un pago de impuestos que el beneficio real ya calcula aparte
 * (el IVA, el impuesto de sociedades). none: un gasto sin más
 */
export type ExpenseRole = 'none' | 'food' | 'staff' | 'vat' | 'corporateTax';

export interface ExpenseType extends ConfigItem {
  icon: string;
  /** El IVA que suele llevar (0, 4, 10 o 21), para el beneficio real */
  vatRate?: number;
  /** Sin él, el de su id en la plantilla (ver templates.ts) */
  role?: ExpenseRole;
}

export type ConfigListKind = 'channels' | 'workers' | 'suppliers' | 'expenseTypes';

export interface BusinessConfig {
  channels: Record<string, Channel>;
  workers: Record<string, Worker>;
  suppliers: Record<string, Supplier>;
  expenseTypes: Record<string, ExpenseType>;
  /** Días que abre (0 domingo … 6 sábado): entre ellos se reparten los fijos */
  openDays: number[];
  /** Lo apuntado antes de esta hora cuenta para el día anterior (cerrar a la 1) */
  dayCutoffHour: number;
  /** Arqueo: fondo de caja y efectivo contado, para ver el descuadre */
  cashCount: boolean;
  /** Fondo de caja que se propone al apuntar a mano */
  floatAmount: number;
  /** Repartir los fijos entre los días que abre, en el día a día */
  spreadFixed: boolean;
  /** Aviso a los socios al cerrar el día */
  notifyOnClose: boolean;
  /** El IVA (modelo 303): si está, el beneficio real va sin IVA */
  vatEnabled?: boolean;
  /** El IVA de lo apuntado a mano, en % (lo de la caja trae el suyo) */
  salesVatRate?: number;
  /** IVA aparte en los gastos: se escribe la base y el IVA de cada factura (ver BusinessExpense.vat) */
  expenseVatSplit?: boolean;
  /** El impuesto de sociedades (modelos 200 y 202): si está, se estima sobre el beneficio */
  corporateTaxEnabled?: boolean;
  corporateTaxRate?: number;
  /** Hasta dónde se quiere que lleguen la materia prima y el personal, en % de lo vendido */
  foodCostTarget?: number;
  staffCostTarget?: number;
  /** Los bloques del Resumen, en su orden, iguales para todos los socios. Sin él, los de partida (ver summaryLayout.ts) */
  summaryBlocks?: string[];
}

// ── Los días ─────────────────────────────────────────────────────

export type DayStatus = 'open' | 'closed';

export interface ManualAmount {
  id: string;
  name: string;
  amount: number;
}

/** El IVA de lo vendido con un tipo: la base y la cuota */
export interface VatLine {
  rate: number;
  base: number;
  vat: number;
}

/**
 * Lo vendido de un día: lo de la caja (id `pos`) o lo apuntado a mano. Lo
 * cobrado por cada forma de cobro, con la copia de sus nombres
 */
export interface DayEntry {
  id: string;
  amounts: Record<string, number>;
  channelNames: Record<string, string>;
  /** Lo que no es de ninguna forma de cobro, escrito a mano */
  manual?: ManualAmount[];
  /** Tickets (ventas) del día: da el ticket medio */
  tickets?: number | null;
  /** Arqueo: fondo de caja y efectivo contado */
  float?: number | null;
  counted?: number | null;
  note?: string;
  by: string;
  at: string;
  // ── Solo en la de la caja ──
  /** Cuántos cobros hubo por forma de cobro (para la comisión fija) */
  counts?: Record<string, number>;
  /** Repartos con factura aún sin cobrar al cerrar: no es venta */
  pending?: number;
  /** El IVA de lo vendido, por tipo */
  vat?: VatLine[];
  /** Cuándo cerró la caja, en ms: un cierre más antiguo no reemplaza a este */
  closedAtMs?: number;
}

export interface BusinessDay {
  /** AAAA-MM-DD */
  id: string;
  status: DayStatus;
  entries: Record<string, DayEntry>;
  /** Quién lo cerró: un socio o la caja (POS_ACTOR) */
  closedBy?: string | null;
  closedAt?: string | null;
  updatedAt?: number;
}

// ── Gastos y fijos ───────────────────────────────────────────────

export interface BusinessExpense {
  id: string;
  /** AAAA-MM-DD */
  date: string;
  /** Lo pagado, con el IVA */
  amount: number;
  /** El IVA de la factura, si se escribió aparte (va dentro de amount). Sin él, sale del tipo */
  vat?: number | null;
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
  /** El IVA, si se escribió aparte: pasa a cada gasto que sale del fijo */
  vat?: number | null;
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

export type ChangeKind = 'day' | 'entry' | 'expense' | 'recurring';
export type ChangeAction = 'edit' | 'delete';

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
  /** Un socio o la caja (POS_ACTOR) */
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
