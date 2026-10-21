import { BusinessConfig, BusinessDay, BusinessExpense, BusinessRecurring, DayStatus } from '../types';
import { expenseRole } from '../templates';
import { cents, dayIdsOfMonth, monthKeyOfDay, monthKey, sumOf, weekdayOfDay } from './basics';
import { dayFigures } from './days';
import { existingRecurringKeys, pendingRecurringOfMonth } from './recurring';
import { taxEstimate, TaxEstimate } from './taxes';

export interface DayRow {
  id: string;
  weekday: number;
  /** Abre ese día (Días que abres): entre estos se reparten los fijos */
  open: boolean;
  /** Aún no ha llegado */
  future: boolean;
  status: DayStatus | null;
  /** Lo ha cerrado la caja */
  fromPos: boolean;
  sales: number;
  /** Los gastos de ese día (sin los fijos, si se reparten) */
  spent: number;
  /** Su parte de los fijos del mes, si se reparten */
  fixedShare: number;
  /** Lo vendido menos lo gastado: beneficio (positivo) o pérdida */
  result: number;
  hasData: boolean;
}

export interface Named {
  key: string;
  name: string;
  amount: number;
}

export interface MonthSummary {
  year: number;
  month0: number;
  sales: number;
  /** Los gastos apuntados del mes, con los fijos que ya tienen su gasto */
  expenses: number;
  /** Los fijos del mes que aún no tienen gasto (lo que falta por pagar) */
  pendingFixed: number;
  /** Lo vendido menos lo gastado */
  profit: number;
  /** Contando también los fijos que faltan */
  forecastProfit: number;
  /** Sin IVA y con el impuesto de sociedades estimado (ver taxes.ts) */
  taxes: TaxEstimate;
  days: DayRow[];
  byChannel: Named[];
  manual: Named[];
  byType: (Named & { icon: string })[];
  bySupplier: (Named & { count: number })[];
  /** Lo gastado en materia prima y bebidas, y en personal */
  foodCost: number;
  staffCost: number;
  tickets: number;
  avgTicket: number | null;
  cashDiff: number | null;
  /** Repartos con factura que quedaron sin cobrar al cerrar (no es venta) */
  pendingSales: number;
  daysWithSales: number;
}

export interface MonthInput {
  year: number;
  month0: number;
  /** El día de hoy del negocio (AAAA-MM-DD) */
  todayId: string;
  config: BusinessConfig;
  days: Record<string, BusinessDay>;
  expenses: readonly BusinessExpense[];
  recurring: readonly BusinessRecurring[];
}

const add = (record: Record<string, Named>, key: string, name: string, amount: number) => {
  if (!amount) return;
  const prev = record[key];
  record[key] = { key, name, amount: cents((prev?.amount ?? 0) + amount) };
};

const sorted = <T extends { amount: number }>(record: Record<string, T>): T[] =>
  Object.values(record).sort((a, b) => b.amount - a.amount);

/** El resumen de un mes: lo vendido y lo gastado, día a día y por cada cosa */
export const monthSummary = ({
  year, month0, todayId, config, days, expenses, recurring,
}: MonthInput): MonthSummary => {
  const month = monthKey(year, month0);
  const dayIds = dayIdsOfMonth(year, month0);

  const monthExpenses = expenses.filter((e) => monthKeyOfDay(e.date) === month);
  const pending = pendingRecurringOfMonth(recurring, existingRecurringKeys(expenses), year, month0);
  const pendingFixed = sumOf(pending, (p) => p.recurring.amount);

  const spread = config.spreadFixed;
  const fixedTotal = cents(sumOf(monthExpenses.filter((e) => e.recurringId), (e) => e.amount) + pendingFixed);
  const openDays = new Set(config.openDays?.length ? config.openDays : [0, 1, 2, 3, 4, 5, 6]);
  const openCount = dayIds.filter((id) => openDays.has(weekdayOfDay(id))).length || 1;

  const spentByDay: Record<string, number> = {};
  for (const e of monthExpenses) {
    if (spread && e.recurringId) continue;
    spentByDay[e.date] = cents((spentByDay[e.date] ?? 0) + e.amount);
  }

  const channels: Record<string, Named> = {};
  const manual: Record<string, Named> = {};
  let tickets = 0;
  let ticketSales = 0;
  let cashDiff: number | null = null;
  let pendingSales = 0;
  let daysWithSales = 0;

  const rows: DayRow[] = dayIds.map((id) => {
    const weekday = weekdayOfDay(id);
    const open = openDays.has(weekday);
    const day = days[id];
    const figures = dayFigures(day, config);
    const spent = spentByDay[id] ?? 0;
    const fixedShare = spread && open ? cents(fixedTotal / openCount) : 0;

    if (figures.sales > 0) daysWithSales += 1;
    for (const [cid, amount] of Object.entries(figures.byChannel)) add(channels, cid, figures.channelNames[cid] ?? cid, amount);
    for (const [name, amount] of Object.entries(figures.manual)) add(manual, name.toLocaleLowerCase(), name, amount);
    if (figures.cashDiff != null) cashDiff = cents((cashDiff ?? 0) + figures.cashDiff);
    tickets += figures.tickets;
    ticketSales = cents(ticketSales + figures.ticketSales);
    pendingSales = cents(pendingSales + figures.pending);

    return {
      id,
      weekday,
      open,
      future: id > todayId,
      status: day?.status ?? null,
      fromPos: figures.fromPos,
      sales: figures.sales,
      spent,
      fixedShare,
      result: cents(figures.sales - spent - fixedShare),
      hasData: figures.hasData || spent > 0,
    };
  });

  const byType: Record<string, Named & { icon: string }> = {};
  const bySupplier: Record<string, Named & { count: number }> = {};
  for (const e of monthExpenses) {
    const type = config.expenseTypes?.[e.typeId];
    const prevType = byType[e.typeId];
    byType[e.typeId] = {
      key: e.typeId,
      name: type?.name ?? e.typeName,
      icon: type?.icon ?? 'receipt',
      amount: cents((prevType?.amount ?? 0) + e.amount),
    };
    const supplierName = (e.supplierId && config.suppliers?.[e.supplierId]?.name) || e.supplierName;
    if (supplierName) {
      const key = e.supplierId ?? `name|${supplierName.toLocaleLowerCase()}`;
      const prev = bySupplier[key];
      bySupplier[key] = {
        key, name: supplierName,
        amount: cents((prev?.amount ?? 0) + e.amount),
        count: (prev?.count ?? 0) + 1,
      };
    }
  }

  const sales = sumOf(rows, (r) => r.sales);
  const spentTotal = sumOf(monthExpenses, (e) => e.amount);
  const profit = cents(sales - spentTotal);
  return {
    year,
    month0,
    sales,
    expenses: spentTotal,
    pendingFixed,
    profit,
    forecastProfit: cents(profit - pendingFixed),
    taxes: taxEstimate(dayIds.map((id) => days[id]), monthExpenses, config),
    days: rows,
    byChannel: sorted(channels),
    manual: sorted(manual),
    byType: sorted(byType),
    bySupplier: sorted(bySupplier),
    foodCost: sumOf(monthExpenses.filter((e) => expenseRole(e.typeId, config) === 'food'), (e) => e.amount),
    staffCost: sumOf(monthExpenses.filter((e) => expenseRole(e.typeId, config) === 'staff'), (e) => e.amount),
    tickets,
    avgTicket: tickets > 0 ? cents(ticketSales / tickets) : null,
    cashDiff,
    pendingSales,
    daysWithSales,
  };
};
