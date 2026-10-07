import {
  BusinessConfig, BusinessDay, BusinessExpense, BusinessRecurring, DayStatus, Order, OrdersSummary,
} from '../types';
import { cents, dayIdsOfMonth, monthKeyOfDay, monthKey, sumOf, weekdayOfDay } from './basics';
import { dayFigures, entryCashDiff, entryTotal, usesOrders } from './days';
import { mergeSummaries } from './orders';
import { existingRecurringKeys, pendingRecurringOfMonth } from './recurring';

export interface DayRow {
  id: string;
  weekday: number;
  /** Abre ese día (Días que abres): entre estos se reparten los fijos */
  open: boolean;
  /** Aún no ha llegado */
  future: boolean;
  status: DayStatus | null;
  sales: number;
  /** Los gastos de ese día (sin los fijos, si se reparten) */
  spent: number;
  /** Su parte de los fijos del mes, si se reparten */
  fixedShare: number;
  /** Lo vendido menos lo gastado: beneficio (positivo) o pérdida */
  result: number;
  hasData: boolean;
  provisional: boolean;
}

export interface Named {
  key: string;
  name: string;
  amount: number;
}

export interface WorkerRow {
  key: string;
  name: string;
  sales: number;
  tickets: number;
  cashDiff: number | null;
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
  days: DayRow[];
  byChannel: Named[];
  manual: Named[];
  byType: (Named & { icon: string })[];
  bySupplier: (Named & { count: number })[];
  byWorker: WorkerRow[];
  bySection: Named[];
  tickets: number;
  avgTicket: number | null;
  cashDiff: number | null;
  orders: OrdersSummary | null;
  daysWithSales: number;
}

export interface MonthInput {
  year: number;
  month0: number;
  /** El día de hoy del negocio (AAAA-MM-DD) */
  todayId: string;
  config: BusinessConfig;
  days: Record<string, BusinessDay>;
  orders: readonly Order[];
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
  year, month0, todayId, config, days, orders, expenses, recurring,
}: MonthInput): MonthSummary => {
  const month = monthKey(year, month0);
  const dayIds = dayIdsOfMonth(year, month0);

  const ordersByDay: Record<string, Order[]> = {};
  for (const order of orders) {
    if (monthKeyOfDay(order.day) !== month) continue;
    (ordersByDay[order.day] ??= []).push(order);
  }

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
  const workers: Record<string, WorkerRow> = {};
  const sections: Record<string, Named> = {};
  const summaries: OrdersSummary[] = [];
  let tickets = 0;
  let ticketSales = 0;
  let cashDiff: number | null = null;
  let daysWithSales = 0;
  const orderMode = usesOrders(config);

  const rows: DayRow[] = dayIds.map((id) => {
    const weekday = weekdayOfDay(id);
    const open = openDays.has(weekday);
    const day = days[id];
    const figures = dayFigures(day, ordersByDay[id] ?? [], config);
    const spent = spentByDay[id] ?? 0;
    const fixedShare = spread && open ? cents(fixedTotal / openCount) : 0;

    if (figures.sales > 0) daysWithSales += 1;
    for (const [cid, amount] of Object.entries(figures.byChannel)) add(channels, cid, figures.channelNames[cid] ?? cid, amount);
    for (const [name, amount] of Object.entries(figures.manual)) add(manual, name.toLocaleLowerCase(), name, amount);
    if (figures.cashDiff != null) cashDiff = cents((cashDiff ?? 0) + figures.cashDiff);
    if (figures.ordersSummary) summaries.push(figures.ordersSummary);
    if (orderMode) {
      tickets += figures.tickets;
      ticketSales = cents(ticketSales + (figures.ordersSummary?.total ?? 0));
    }

    // Por empleado y por sección: de lo apuntado en cada caja o turno
    if (!figures.provisional) {
      for (const entry of Object.values(day?.entries ?? {})) {
        if (entry.fromOrders) continue;
        const total = entryTotal(entry);
        if (!orderMode && entry.tickets) {
          tickets += entry.tickets;
          ticketSales = cents(ticketSales + total);
        }
        const workerName = (entry.workerId && config.workers?.[entry.workerId]?.name) || entry.workerName;
        if (workerName) {
          const key = entry.workerId ?? `name|${workerName.toLocaleLowerCase()}`;
          const prev = workers[key] ?? { key, name: workerName, sales: 0, tickets: 0, cashDiff: null };
          const diff = entryCashDiff(entry, config);
          workers[key] = {
            ...prev,
            name: workerName,
            sales: cents(prev.sales + total),
            tickets: prev.tickets + (entry.tickets ?? 0),
            cashDiff: diff == null ? prev.cashDiff : cents((prev.cashDiff ?? 0) + diff),
          };
        }
        for (const [sid, amount] of Object.entries(entry.sections ?? {})) {
          add(sections, sid, config.sections?.[sid]?.name ?? entry.sectionNames?.[sid] ?? sid, amount);
        }
      }
    }

    return {
      id,
      weekday,
      open,
      future: id > todayId,
      status: day?.status ?? null,
      sales: figures.sales,
      spent,
      fixedShare,
      result: cents(figures.sales - spent - fixedShare),
      hasData: figures.hasData || spent > 0,
      provisional: figures.provisional,
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
    days: rows,
    byChannel: sorted(channels),
    manual: sorted(manual),
    byType: sorted(byType),
    bySupplier: sorted(bySupplier),
    byWorker: Object.values(workers).sort((a, b) => b.sales - a.sales),
    bySection: sorted(sections),
    tickets,
    avgTicket: tickets > 0 ? cents(ticketSales / tickets) : null,
    cashDiff,
    orders: summaries.length ? mergeSummaries(summaries) : null,
    daysWithSales,
  };
};
