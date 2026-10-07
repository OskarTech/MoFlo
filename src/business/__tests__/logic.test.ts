import {
  businessDayOf, cents, dayIdsOfMonth, isDayId, monthKeyOfDay, nextOrder, orderedItems, shiftDayId,
} from '../logic/basics';
import {
  describeOrder, extrasForProduct, lineTotal, mergeSummaries, orderTotal, ranking, summarizeOrders,
} from '../logic/orders';
import { dayFigures, entryCashDiff, entryTotal } from '../logic/days';
import {
  dueRecurringExpenses, existingRecurringKeys, pendingRecurringOfMonth, recurringExpenseId,
} from '../logic/recurring';
import { monthSummary } from '../logic/summary';
import {
  BusinessConfig, BusinessDay, BusinessExpense, BusinessRecurring, Catalog, Order, OrderLine,
} from '../types';

// ── Ayudantes ────────────────────────────────────────────────────

const config = (over: Partial<BusinessConfig> = {}): BusinessConfig => ({
  mode: 'expert',
  salesMethod: 'orders',
  channels: {
    cash: { name: 'Efectivo', kind: 'cash', order: 1 },
    card: { name: 'Tarjeta', kind: 'card', order: 2 },
    glovo: { name: 'Glovo', kind: 'other', order: 3, commissionPct: 30 },
  },
  workers: { w1: { name: 'Ana', order: 1 }, w2: { name: 'Luis', order: 2 } },
  suppliers: { s1: { name: 'Makro', order: 1, typeId: 'suppliers' } },
  expenseTypes: {
    suppliers: { name: 'Proveedores', icon: 'cart', order: 1 },
    rent: { name: 'Alquiler', icon: 'home', order: 2 },
    payroll: { name: 'Nóminas', icon: 'people', order: 3 },
  },
  sections: {},
  tills: {},
  shifts: {},
  openDays: [0, 1, 2, 3, 4, 5, 6],
  dayCutoffHour: 0,
  cashCount: true,
  floatAmount: 100,
  spreadFixed: true,
  notifyOnClose: true,
  ...over,
});

const line = (over: Partial<OrderLine>): OrderLine => ({
  key: 'k', productId: 'p2', categoryId: 'c_pizzas', name: 'Barbacoa',
  sizeId: 's_family', sizeName: 'Familiar', unitPrice: 14.5, qty: 1, extras: [], ...over,
});

const order = (over: Partial<Order>): Order => ({
  id: 'o1', day: '2026-10-07', at: new Date(2026, 9, 7, 21, 30).toISOString(),
  lines: [line({})], total: 14.5, channelId: 'card', channelName: 'Tarjeta',
  status: 'ok', by: 'u1', ...over,
});

// ── Lo básico ────────────────────────────────────────────────────

describe('lo básico', () => {
  it('redondea a céntimos sin errores de coma flotante', () => {
    expect(cents(0.1 + 0.2)).toBe(0.3);
    expect(cents(14.505)).toBe(14.51);
  });

  it('cuenta lo apuntado de madrugada para el día anterior si hay hora de corte', () => {
    expect(businessDayOf(new Date(2026, 9, 8, 1, 30), 4)).toBe('2026-10-07');
    expect(businessDayOf(new Date(2026, 9, 8, 4, 0), 4)).toBe('2026-10-08');
    expect(businessDayOf(new Date(2026, 9, 8, 1, 30), 0)).toBe('2026-10-08');
  });

  it('maneja días, meses y su validación', () => {
    expect(dayIdsOfMonth(2026, 1)).toHaveLength(28);
    expect(dayIdsOfMonth(2024, 1)).toHaveLength(29);
    expect(shiftDayId('2026-03-01', -1)).toBe('2026-02-28');
    expect(monthKeyOfDay('2026-10-07')).toBe('2026-10');
    expect(isDayId('2026-10-07')).toBe(true);
    expect(isDayId('2026-02-30')).toBe(false);
    expect(isDayId('07/10/2026')).toBe(false);
  });

  it('ordena las piezas por su orden y deja fuera las archivadas', () => {
    const items = { a: { name: 'B', order: 2 }, b: { name: 'A', order: 1 }, c: { name: 'C', order: 0, archived: true } };
    expect(orderedItems(items).map((i) => i.id)).toEqual(['b', 'a']);
    expect(orderedItems(items, { withArchived: true }).map((i) => i.id)).toEqual(['c', 'b', 'a']);
    expect(nextOrder(items)).toBe(3);
    expect(nextOrder({})).toBe(1);
  });
});

// ── Pedidos ──────────────────────────────────────────────────────

describe('pedidos', () => {
  it('suma los extras a cada unidad', () => {
    const l = line({ qty: 2, extras: [{ extraId: 'x', name: 'Extra de queso', price: 1 }, { name: 'Huevo', price: 0.5 }] });
    expect(lineTotal(l)).toBe(32);
    expect(orderTotal([l, line({ productId: 'd1', name: 'Coca-Cola', sizeId: null, sizeName: null, unitPrice: 2, qty: 3 })])).toBe(38);
  });

  it('describe el pedido en una línea', () => {
    const text = describeOrder([
      line({ qty: 2, extras: [{ extraId: 'x', name: 'Extra de queso', price: 1 }] }),
      line({ productId: 'd1', name: 'Coca-Cola', sizeId: null, sizeName: null, unitPrice: 2 }),
    ]);
    expect(text).toBe('2 Barbacoa familiar + extra de queso, Coca-Cola');
  });

  it('da los extras de la categoría del producto y los de todo', () => {
    const catalog: Catalog = {
      categories: { c_pizzas: { name: 'Pizzas', order: 1 }, c_drinks: { name: 'Bebidas', order: 2 } },
      products: {},
      extras: {
        x1: { name: 'Queso', price: 1, order: 1, categoryIds: ['c_pizzas'] },
        x2: { name: 'Hielo', price: 0.2, order: 2, categoryIds: ['c_drinks'] },
        x3: { name: 'Para llevar', price: 0.5, order: 3 },
        x4: { name: 'Viejo', price: 1, order: 4, archived: true },
      },
    };
    expect(extrasForProduct(catalog, { categoryId: 'c_pizzas' }).map((x) => x.id)).toEqual(['x1', 'x3']);
    expect(extrasForProduct(catalog, { categoryId: 'c_drinks' }).map((x) => x.id)).toEqual(['x2', 'x3']);
  });

  it('resume lo vendido: sin los anulados, por producto y tamaño, extras, tamaños y horas', () => {
    const orders = [
      order({ id: 'a', lines: [line({ qty: 2, extras: [{ extraId: 'xq', name: 'Queso', price: 1 }] })], total: 31, channelId: 'cash', channelName: 'Efectivo' }),
      order({ id: 'b', lines: [line({ sizeId: 's_medium', sizeName: 'Mediana', unitPrice: 9.5 })], total: 9.5 }),
      order({ id: 'c', lines: [line({})], total: 14.5, status: 'void' }),
      order({ id: 'd', lines: [line({ productId: null, name: 'Tarta de encargo', sizeId: null, sizeName: null, unitPrice: 20 })], total: 20, at: new Date(2026, 9, 7, 13, 5).toISOString() }),
    ];
    const s = summarizeOrders(orders);
    expect(s.count).toBe(3);
    expect(s.voided).toBe(1);
    expect(s.total).toBe(60.5);
    expect(s.byChannel).toEqual({ cash: 31, card: 29.5 });
    expect(s.items['p2|s_family']).toEqual({ name: 'Barbacoa familiar', qty: 2, amount: 29, categoryId: 'c_pizzas' });
    expect(s.items['p2|s_medium'].qty).toBe(1);
    expect(s.items['manual|tarta de encargo'].amount).toBe(20);
    expect(s.extras.xq).toEqual({ name: 'Queso', qty: 2, amount: 2, categoryId: null });
    expect(s.sizes).toEqual({ Familiar: 2, Mediana: 1 });
    expect(s.hours).toEqual({ 21: 2, 13: 1 });
    expect(ranking(s.items)[0].key).toBe('p2|s_family');
  });

  it('junta los resúmenes de varios días', () => {
    const a = summarizeOrders([order({ id: 'a' })]);
    const b = summarizeOrders([order({ id: 'b' }), order({ id: 'c', status: 'void' })]);
    const m = mergeSummaries([a, b]);
    expect(m.count).toBe(2);
    expect(m.voided).toBe(1);
    expect(m.total).toBe(29);
    expect(m.items['p2|s_family'].qty).toBe(2);
  });

  it('agrupa por el id del producto: renombrarlo no parte sus ventas', () => {
    const s = summarizeOrders([order({ id: 'a' }), order({ id: 'b', lines: [line({ name: 'BBQ' })] })]);
    expect(Object.keys(s.items)).toEqual(['p2|s_family']);
    expect(s.items['p2|s_family'].qty).toBe(2);
  });
});

// ── Días ─────────────────────────────────────────────────────────

describe('días', () => {
  it('con el día abierto, en pedido a pedido, lo vendido sale de los pedidos', () => {
    const f = dayFigures(undefined, [order({ id: 'a', total: 20, channelId: 'cash', channelName: 'Efectivo' }), order({ id: 'b', total: 10 })], config());
    expect(f.provisional).toBe(true);
    expect(f.sales).toBe(30);
    expect(f.tickets).toBe(2);
    expect(f.byChannel).toEqual({ cash: 20, card: 10 });
  });

  it('con el día cerrado, sale de lo confirmado en el cierre', () => {
    const day: BusinessDay = {
      id: '2026-10-07', status: 'closed',
      entries: {
        close: {
          id: 'close', fromOrders: true, amounts: { cash: 312, card: 405.5, glovo: 96 }, channelNames: {},
          float: 100, counted: 410, by: 'u1', at: '',
        },
      },
      ordersSummary: summarizeOrders([order({ id: 'a' })]),
    };
    const f = dayFigures(day, [], config());
    expect(f.provisional).toBe(false);
    expect(f.sales).toBe(813.5);
    expect(f.tickets).toBe(1);
    expect(f.cashDiff).toBe(-2);
  });

  it('reabierto, vuelve a salir de los pedidos y no cuenta el cierre anterior', () => {
    const day: BusinessDay = {
      id: '2026-10-07', status: 'open',
      entries: { close: { id: 'close', fromOrders: true, amounts: { cash: 999 }, channelNames: {}, by: 'u1', at: '' } },
    };
    expect(dayFigures(day, [order({ id: 'a', total: 15 })], config()).sales).toBe(15);
  });

  it('por caja: suma las cajas, sus tickets y el descuadre', () => {
    const c = config({ salesMethod: 'tills' });
    const day: BusinessDay = {
      id: '2026-10-07', status: 'open',
      entries: {
        e1: { id: 'e1', amounts: { cash: 1240.5, card: 2310.2 }, channelNames: {}, tickets: 212, float: 150, counted: 1388, by: 'u1', at: '' },
        e2: { id: 'e2', amounts: { cash: 860, card: 1480.3 }, channelNames: {}, tickets: 151, manual: [{ id: 'm', name: 'Encargo', amount: 30 }], by: 'u1', at: '' },
      },
    };
    const f = dayFigures(day, [], c);
    expect(f.sales).toBe(5921);
    expect(f.tickets).toBe(363);
    expect(f.cashDiff).toBe(-2.5);
    expect(f.manual).toEqual({ Encargo: 30 });
    expect(entryTotal(day.entries.e2)).toBe(2370.3);
    expect(entryCashDiff({ amounts: { cash: 100 }, float: 50, counted: 150 }, c)).toBe(0);
    expect(entryCashDiff({ amounts: { cash: 100 } }, c)).toBeNull();
  });
});

// ── Fijos ────────────────────────────────────────────────────────

describe('fijos', () => {
  const rent: BusinessRecurring = {
    id: 'r1', name: 'Alquiler', amount: 1200, typeId: 'rent', typeName: 'Alquiler',
    day: 31, active: true, by: 'u1', createdAt: new Date(2026, 7, 10).toISOString(),
  };

  it('crea el gasto de cada mes desde que existe, el día que toca (o el último del mes)', () => {
    const due = dueRecurringExpenses([rent], new Set(), new Date(2026, 9, 7), 'u1');
    // Agosto (31) y septiembre (30); octubre aún no
    expect(due.map((e) => [e.id, e.date])).toEqual([
      [recurringExpenseId('r1', '2026-08'), '2026-08-31'],
      [recurringExpenseId('r1', '2026-09'), '2026-09-30'],
    ]);
    expect(due[0]).toMatchObject({ amount: 1200, name: 'Alquiler', recurringId: 'r1', typeId: 'rent' });
  });

  it('un gasto del fijo con otro id también cuenta como apuntado', () => {
    const keys = existingRecurringKeys([{ id: 'manual1', date: '2026-08-31', recurringId: 'r1' }]);
    const due = dueRecurringExpenses([rent], keys, new Date(2026, 9, 7), 'u1');
    expect(due.map((e) => e.date)).toEqual(['2026-09-30']);
  });

  it('no repite los que ya están, ni los meses borrados, ni los fijos en pausa', () => {
    const existing = new Set([recurringExpenseId('r1', '2026-08')]);
    expect(dueRecurringExpenses([{ ...rent, skipped: ['2026-09'] }], existing, new Date(2026, 9, 7), 'u1')).toEqual([]);
    expect(dueRecurringExpenses([{ ...rent, active: false }], new Set(), new Date(2026, 9, 7), 'u1')).toEqual([]);
  });

  it('dice qué fijos del mes aún no tienen gasto', () => {
    const payroll = { ...rent, id: 'r2', name: 'Nómina de Ana', amount: 1450, day: 30 };
    const pending = pendingRecurringOfMonth([rent, payroll], new Set([recurringExpenseId('r1', '2026-10')]), 2026, 9);
    expect(pending.map((p) => p.recurring.id)).toEqual(['r2']);
    expect(pending[0].date).toBe('2026-10-30');
  });
});

// ── Resumen del mes ──────────────────────────────────────────────

describe('resumen del mes', () => {
  const c = config({ salesMethod: 'tills', openDays: [1, 2, 3, 4, 5, 6] });
  const days: Record<string, BusinessDay> = {
    '2026-09-01': {
      id: '2026-09-01', status: 'closed',
      entries: {
        e1: { id: 'e1', workerId: 'w1', amounts: { cash: 600, card: 400 }, channelNames: {}, tickets: 80, float: 100, counted: 698, by: 'u1', at: '' },
        e2: { id: 'e2', workerName: 'Jorge', amounts: { card: 500 }, channelNames: {}, tickets: 20, by: 'u1', at: '' },
      },
    },
    '2026-09-02': {
      id: '2026-09-02', status: 'closed',
      entries: { e3: { id: 'e3', workerId: 'w1', amounts: { cash: 300 }, channelNames: {}, tickets: 25, by: 'u1', at: '' } },
    },
  };
  const expenses: BusinessExpense[] = [
    { id: 'x1', date: '2026-09-01', amount: 900, typeId: 'suppliers', typeName: 'Proveedores', supplierId: 's1', supplierName: 'Makro', by: 'u1', createdAt: '' },
    { id: 'x2', date: '2026-09-01', amount: 1300, typeId: 'rent', typeName: 'Alquiler', recurringId: 'r1', by: 'u1', createdAt: '' },
    { id: 'x3', date: '2026-08-31', amount: 50, typeId: 'suppliers', typeName: 'Proveedores', by: 'u1', createdAt: '' },
  ];
  const recurring: BusinessRecurring[] = [
    { id: 'r1', name: 'Alquiler', amount: 1300, typeId: 'rent', typeName: 'Alquiler', day: 1, active: true, by: 'u1', createdAt: new Date(2026, 0, 1).toISOString() },
    { id: 'r2', name: 'Luz', amount: 260, typeId: 'rent', typeName: 'Luz', day: 15, active: true, by: 'u1', createdAt: new Date(2026, 0, 1).toISOString() },
  ];
  const summary = monthSummary({
    year: 2026, month0: 8, todayId: '2026-09-30', config: c, days, orders: [], expenses, recurring,
  });

  it('suma ventas, gastos y beneficio del mes, y los fijos que faltan', () => {
    expect(summary.sales).toBe(1800);
    expect(summary.expenses).toBe(2200);
    expect(summary.profit).toBe(-400);
    // La luz de septiembre aún no tiene su gasto
    expect(summary.pendingFixed).toBe(260);
    expect(summary.forecastProfit).toBe(-660);
  });

  it('reparte los fijos entre los días que abre, y el resultado de los días suma el del mes con lo que falta', () => {
    // Septiembre de 2026: 26 días de lunes a sábado
    const open = summary.days.filter((d) => d.open);
    expect(open).toHaveLength(26);
    expect(summary.days.find((d) => d.id === '2026-09-06')?.fixedShare).toBe(0);
    const totalResult = summary.days.reduce((s, d) => s + d.result, 0);
    expect(Math.abs(totalResult - summary.forecastProfit)).toBeLessThan(0.3);
    // El día 1: 1.500 vendidos menos 900 de Makro menos su parte de los fijos (1.560 / 26)
    expect(summary.days[0].result).toBe(cents(1500 - 900 - 60));
  });

  it('saca cómo pagan, por empleado, tickets, descuadres y proveedores', () => {
    expect(Object.fromEntries(summary.byChannel.map((x) => [x.key, x.amount]))).toEqual({ card: 900, cash: 900 });
    expect(summary.byWorker.map((w) => [w.name, w.sales, w.tickets, w.cashDiff])).toEqual([
      ['Ana', 1300, 105, -2],
      ['Jorge', 500, 20, null],
    ]);
    expect(summary.tickets).toBe(125);
    expect(summary.avgTicket).toBe(14.4);
    expect(summary.cashDiff).toBe(-2);
    expect(summary.bySupplier).toEqual([{ key: 's1', name: 'Makro', amount: 900, count: 1 }]);
    expect(summary.byType.map((x) => x.key)).toEqual(['rent', 'suppliers']);
  });

  it('sin repartir, los fijos cuentan el día que se pagan', () => {
    const plain = monthSummary({
      year: 2026, month0: 8, todayId: '2026-09-30', config: { ...c, spreadFixed: false }, days, orders: [], expenses, recurring,
    });
    expect(plain.days[0].result).toBe(cents(1500 - 900 - 1300));
    expect(plain.days[1].fixedShare).toBe(0);
  });

  it('en pedido a pedido, los días abiertos salen de los pedidos y los cerrados de su resumen', () => {
    const oc = config();
    const closed: BusinessDay = {
      id: '2026-10-06', status: 'closed',
      entries: { close: { id: 'close', fromOrders: true, amounts: { card: 14.5 }, channelNames: {}, by: 'u1', at: '' } },
      ordersSummary: summarizeOrders([order({ id: 'a', day: '2026-10-06' })]),
    };
    const s = monthSummary({
      year: 2026, month0: 9, todayId: '2026-10-07', config: oc,
      days: { '2026-10-06': closed },
      orders: [order({ id: 'b', day: '2026-10-07', total: 9.5, lines: [line({ sizeId: 's_medium', sizeName: 'Mediana', unitPrice: 9.5 })] })],
      expenses: [], recurring: [],
    });
    expect(s.sales).toBe(24);
    expect(s.orders?.count).toBe(2);
    expect(s.orders?.sizes).toEqual({ Familiar: 1, Mediana: 1 });
    expect(s.avgTicket).toBe(12);
    expect(s.days.find((d) => d.id === '2026-10-07')?.provisional).toBe(true);
    expect(s.days.find((d) => d.id === '2026-10-08')?.future).toBe(true);
  });
});
