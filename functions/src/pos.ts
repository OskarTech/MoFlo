/**
 * El cierre de caja de la Pizzería Vesuvio: lo que manda su TPV cada vez que
 * se guarda un cierre (ver businessPosClose en business.ts). Aquí, solo lo que
 * no toca la base de datos: leer y comprobar el mensaje, pasarlo a la entrada
 * del día de MoFlo y calcular las comisiones.
 *
 * El mensaje (versión 1) lo comparten los dos proyectos: no se cambia sin
 * hablarlo antes. Los importes llegan en céntimos, enteros; en MoFlo van en
 * euros con decimales.
 */

/** La entrada del día que es de la caja, y quien firma lo suyo (como en la app: src/business/types.ts) */
export const POS_ENTRY_ID = 'pos';
export const POS_ACTOR = 'pos';

/** Las formas de pago de la caja, que en MoFlo tienen estos mismos ids */
export const POS_CHANNELS = ['cash', 'card', 'online'] as const;
export type PosChannel = (typeof POS_CHANNELS)[number];

// Lo razonable: 100.000 € en un día por cada importe y 100.000 tickets
const MAX_CENTS = 10_000_000;
const MAX_COUNT = 100_000;
// Los cierres, como pronto de 2026 (los de prueba, serie P27, ya son de 2026)
const FIRST_CLOSE = Date.UTC(2026, 0, 1);
const DAY_MS = 24 * 60 * 60 * 1000;
// Un día de hace más de esto no llega (salvo que algo vaya mal)
const MAX_DAYS_BACK = 400;

export interface PosVatLine {
  rate: number;
  base: number;
  vat: number;
}

export interface PosClose {
  v: 1;
  /** El día de negocio, AAAA-MM-DD en hora de Madrid */
  day: string;
  /** Cuándo se cerró la caja, en ms */
  closedAt: number;
  /** En céntimos, con las devoluciones restadas (alguno puede salir negativo) */
  byPayment: Record<PosChannel, number>;
  /** Repartos con factura aún sin cobrar: no es venta */
  pending: number;
  total: number;
  tickets: number;
  vat: PosVatLine[];
  float: number | null;
  counted: number | null;
  /** Opcional: cuántos cobros hubo de cada forma de pago (para la comisión fija de Stripe) */
  countByPayment: Record<PosChannel, number> | null;
}

export type ParseResult = { ok: true; close: PosClose } | { ok: false; error: string };

const fail = (error: string): ParseResult => ({ ok: false, error });
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
const intIn = (v: unknown, min: number, max: number): v is number => isInt(v) && v >= min && v <= max;

/** El día (AAAA-MM-DD) de un momento, en hora de Madrid */
export const madridDayId = (ms: number): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(ms));

const isDayId = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

const shiftDay = (id: string, days: number): string =>
  new Date(Date.parse(`${id}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** Lee y comprueba el mensaje entero. now: la hora de ahora, en ms */
export const parsePosClose = (body: unknown, now: number): ParseResult => {
  if (!isObject(body)) return fail('body');
  if (body.v !== 1) return fail('v');

  const { day } = body;
  if (!isDayId(day)) return fail('day');
  const today = madridDayId(now);
  if (day > shiftDay(today, 1)) return fail('day-future');
  if (day < shiftDay(today, -MAX_DAYS_BACK)) return fail('day-old');

  if (!intIn(body.closedAt, FIRST_CLOSE, now + DAY_MS)) return fail('closedAt');

  const byPayment = body.byPayment;
  if (!isObject(byPayment)) return fail('byPayment');
  if (Object.keys(byPayment).some((k) => !(POS_CHANNELS as readonly string[]).includes(k))) return fail('byPayment');
  const payments = {} as Record<PosChannel, number>;
  for (const id of POS_CHANNELS) {
    const v = byPayment[id] ?? 0;
    if (!intIn(v, -MAX_CENTS, MAX_CENTS)) return fail(`byPayment.${id}`);
    payments[id] = v;
  }

  if (!intIn(body.pending ?? 0, 0, MAX_CENTS)) return fail('pending');
  const pending = (body.pending ?? 0) as number;
  if (!isInt(body.total)) return fail('total');
  if (body.total !== payments.cash + payments.card + payments.online + pending) return fail('total-mismatch');
  if (!intIn(body.tickets, 0, MAX_COUNT)) return fail('tickets');

  const vatRaw = body.vat ?? [];
  if (!Array.isArray(vatRaw) || vatRaw.length > 10) return fail('vat');
  const vat: PosVatLine[] = [];
  for (const line of vatRaw) {
    if (!isObject(line)) return fail('vat');
    const { rate, base, vat: quota } = line;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 100) return fail('vat.rate');
    if (!intIn(base, -MAX_CENTS, MAX_CENTS) || !intIn(quota, -MAX_CENTS, MAX_CENTS)) return fail('vat.amount');
    vat.push({ rate, base, vat: quota });
  }

  const cash = (key: 'float' | 'counted'): number | null | 'bad' => {
    const v = body[key];
    if (v == null) return null;
    return intIn(v, 0, MAX_CENTS) ? v : 'bad';
  };
  const float = cash('float');
  const counted = cash('counted');
  if (float === 'bad') return fail('float');
  if (counted === 'bad') return fail('counted');

  let countByPayment: Record<PosChannel, number> | null = null;
  if (body.countByPayment != null) {
    const counts = body.countByPayment;
    if (!isObject(counts) || Object.keys(counts).some((k) => !(POS_CHANNELS as readonly string[]).includes(k))) {
      return fail('countByPayment');
    }
    countByPayment = {} as Record<PosChannel, number>;
    for (const id of POS_CHANNELS) {
      const v = counts[id] ?? 0;
      if (!intIn(v, 0, MAX_COUNT)) return fail(`countByPayment.${id}`);
      countByPayment[id] = v;
    }
  }

  return {
    ok: true,
    close: {
      v: 1, day, closedAt: body.closedAt as number, byPayment: payments, pending, total: body.total,
      tickets: body.tickets as number, vat, float, counted, countByPayment,
    },
  };
};

/** Redondeado a céntimos, como en la app (src/business/logic/basics.ts) */
export const cents = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const euros = (c: number): number => cents(c / 100);

/** La entrada del día, como la guarda la app (DayEntry): en euros */
export const posEntry = (close: PosClose, channelNames: Record<string, string>): Record<string, unknown> => {
  const amounts: Record<string, number> = {};
  for (const id of POS_CHANNELS) if (close.byPayment[id]) amounts[id] = euros(close.byPayment[id]);
  const entry: Record<string, unknown> = {
    id: POS_ENTRY_ID,
    amounts,
    channelNames: Object.fromEntries(Object.keys(amounts).map((id) => [id, channelNames[id] ?? id])),
    tickets: close.tickets,
    float: close.float == null ? null : euros(close.float),
    counted: close.counted == null ? null : euros(close.counted),
    pending: euros(close.pending),
    vat: close.vat.map((l) => ({ rate: l.rate, base: euros(l.base), vat: euros(l.vat) })),
    closedAtMs: close.closedAt,
    by: POS_ACTOR,
    at: new Date(close.closedAt).toISOString(),
  };
  if (close.countByPayment) entry.counts = { ...close.countByPayment };
  return entry;
};

// Igual con las claves en cualquier orden (Firestore no guarda el orden)
const stableJson = (value: unknown): string => JSON.stringify(value, (_key, v) => (
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
    : v
));

/** Si la entrada guardada es la misma que la nueva (un reintento): no hace falta escribir */
export const sameEntry = (a: unknown, b: unknown): boolean => stableJson(a) === stableJson(b);

// ── Las comisiones (lo mismo que src/business/logic/commissions.ts) ──

export const commissionExpenseId = (dayId: string, channelId: string): string =>
  `com_${dayId.replace(/-/g, '')}_${channelId}`;

type EntryLike = { amounts?: Record<string, number>; counts?: Record<string, number> };
type ChannelLike = { commissionPct?: number; commissionFixed?: number };

/** La comisión de cada forma de cobro de la configuración, sobre todo lo cobrado ese día */
export const dayCommissions = (entries: readonly EntryLike[], channels: Record<string, ChannelLike>): Record<string, number> => {
  const amounts: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    for (const [id, v] of Object.entries(entry.amounts ?? {})) amounts[id] = cents((amounts[id] ?? 0) + (v || 0));
    for (const [id, n] of Object.entries(entry.counts ?? {})) counts[id] = (counts[id] ?? 0) + (n || 0);
  }
  const out: Record<string, number> = {};
  for (const [id, channel] of Object.entries(channels)) {
    const pct = channel.commissionPct ?? 0;
    const fixed = channel.commissionFixed ?? 0;
    const amount = amounts[id] ?? 0;
    const value = (pct > 0 && amount > 0 ? (amount * pct) / 100 : 0) + (fixed > 0 ? (counts[id] ?? 0) * fixed : 0);
    out[id] = value > 0 ? cents(value) : 0;
  }
  return out;
};
