import {
  businessDayOf, cents, dayIdsOfMonth, isDayId, monthKeyOfDay, nextOrder, orderedItems, shiftDayId,
} from '../logic/basics';
import { dayEntries, dayFigures, entryCashDiff, entryTotal } from '../logic/days';
import { commissionExpenseId, dayCommissions, isCommissionExpense } from '../logic/commissions';
import {
  dueRecurringExpenses, existingRecurringKeys, pendingRecurringOfMonth, recurringExpenseId,
} from '../logic/recurring';
import { entrySalesVat, quarterMonths, splitAmount, taxEstimate, vatOfBase } from '../logic/taxes';
import { monthSummary } from '../logic/summary';
import { expenseTypesByUse, recurringTypesByUse } from '../logic/usage';
import {
  addBlock, DEFAULT_SUMMARY_BLOCKS, hiddenBlocks, moveBlock, removeBlock, summaryLayout,
} from '../logic/summaryLayout';
import { buildConfig, EXPENSE_TYPES } from '../templates';
import { BusinessConfig, BusinessDay, BusinessExpense, BusinessRecurring, DayEntry } from '../types';

// ── Ayudantes ────────────────────────────────────────────────────

const config = (over: Partial<BusinessConfig> = {}): BusinessConfig => ({
  channels: {
    cash: { name: 'Efectivo', kind: 'cash', order: 1 },
    card: { name: 'Tarjeta', kind: 'card', order: 2, commissionPct: 0.5 },
    online: { name: 'Online', kind: 'other', order: 3, commissionPct: 1.5, commissionFixed: 0.25 },
  },
  workers: { w1: { name: 'Ana', order: 1 } },
  suppliers: { s1: { name: 'Makro', order: 1, typeId: 'ingredients' } },
  expenseTypes: {
    ingredients: { name: 'Materia prima', icon: 'basket', order: 1, vatRate: 10 },
    rent: { name: 'Alquiler', icon: 'home', order: 2, vatRate: 21 },
    payroll: { name: 'Nóminas', icon: 'people', order: 3, vatRate: 0 },
    electricity: { name: 'Luz', icon: 'flash', order: 4, vatRate: 21 },
    commissions: { name: 'Comisiones', icon: 'card', order: 5, vatRate: 0 },
    vat: { name: 'IVA (modelo 303)', icon: 'receipt', order: 6, vatRate: 0 },
  },
  openDays: [0, 1, 2, 3, 4, 5, 6],
  dayCutoffHour: 0,
  cashCount: true,
  floatAmount: 100,
  spreadFixed: true,
  notifyOnClose: true,
  salesVatRate: 10,
  corporateTaxRate: 15,
  ...over,
});

/** Lo que manda la caja: el ejemplo del mensaje (en euros, como lo guarda el servidor) */
const posEntry = (over: Partial<DayEntry> = {}): DayEntry => ({
  id: 'pos', amounts: { cash: 450, card: 600, online: 184.5 }, channelNames: {},
  tickets: 37, float: 100, counted: 550, pending: 0,
  vat: [{ rate: 10, base: 1000, vat: 100 }, { rate: 21, base: 111.16, vat: 23.34 }],
  closedAtMs: 1804977600000, by: 'pos', at: '2027-03-13T23:00:00.000Z', ...over,
});

const manual = (over: Partial<DayEntry> = {}): DayEntry => ({
  id: 'e1', amounts: { cash: 120 }, channelNames: {}, by: 'u1', at: '2027-03-13T20:00:00.000Z', ...over,
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

// ── Días ─────────────────────────────────────────────────────────

describe('días', () => {
  it('suma lo de la caja y lo apuntado a mano; lo pendiente de cobro no es venta', () => {
    const day: BusinessDay = {
      id: '2027-03-13', status: 'closed', closedBy: 'pos',
      entries: { e1: manual(), pos: posEntry({ pending: 50 }) },
    };
    const f = dayFigures(day, config());
    expect(f.sales).toBe(1354.5);
    expect(f.byChannel).toEqual({ cash: 570, card: 600, online: 184.5 });
    expect(f.pending).toBe(50);
    expect(f.fromPos).toBe(true);
    // Los tickets y su ticket medio, solo con lo que los trae (la caja)
    expect(f.tickets).toBe(37);
    expect(f.ticketSales).toBe(1234.5);
    // Arqueo de la caja: 550 contados = 100 de fondo + 450 en efectivo
    expect(f.cashDiff).toBe(0);
    // La de la caja, primero
    expect(dayEntries(day).map((e) => e.id)).toEqual(['pos', 'e1']);
  });

  it('un día sin nada no tiene datos', () => {
    const f = dayFigures(undefined, config());
    expect(f).toMatchObject({ sales: 0, hasData: false, fromPos: false, cashDiff: null });
  });

  it('el total de una entrada y el descuadre del arqueo', () => {
    const c = config();
    expect(entryTotal(manual({ amounts: { cash: 100, card: 50.25 }, manual: [{ id: 'm', name: 'Encargo', amount: 30 }] }))).toBe(180.25);
    expect(entryCashDiff({ amounts: { cash: 100 }, float: 50, counted: 147.5 }, c)).toBe(-2.5);
    expect(entryCashDiff({ amounts: { cash: 100 } }, c)).toBeNull();
  });
});

// ── Comisiones ───────────────────────────────────────────────────

describe('comisiones', () => {
  it('un % de lo cobrado y, si la caja dice cuántos cobros hubo, un fijo por cada uno', () => {
    const c = config();
    expect(dayCommissions([posEntry()], c.channels)).toEqual({ cash: 0, card: 3, online: 2.77 });
    expect(dayCommissions([posEntry({ counts: { online: 12 } })], c.channels)).toEqual({ cash: 0, card: 3, online: 5.77 });
  });

  it('suma todo lo del día, también lo de a mano', () => {
    const c = config();
    expect(dayCommissions([posEntry(), manual({ amounts: { card: 200 } })], c.channels).card).toBe(4);
  });

  it('con más devoluciones que ventas no hay comisión, salvo el fijo de cada cobro', () => {
    const c = config();
    const refunds = posEntry({ amounts: { cash: 10, card: -40, online: -5 }, counts: { online: 2 } });
    expect(dayCommissions([refunds], c.channels)).toEqual({ cash: 0, card: 0, online: 0.5 });
  });

  it('se sabe qué gastos son estas comisiones', () => {
    expect(isCommissionExpense(commissionExpenseId('2027-03-13', 'online'))).toBe(true);
    expect(isCommissionExpense('Xb2kQ9rLmT0aZ1cV3dWe')).toBe(false);
  });

  it('el id del gasto es el mismo que el del servidor', () => {
    expect(commissionExpenseId('2027-03-13', 'online')).toBe('com_20270313_online');
  });
});

// ── Impuestos ────────────────────────────────────────────────────

describe('beneficio real', () => {
  it('el IVA de lo vendido sale del que manda la caja; a mano, del de la configuración', () => {
    // 1.234,50 vendidos con 123,34 de IVA
    expect(entrySalesVat(posEntry(), 10)).toBe(123.34);
    // Con 50 pendientes de cobro, la parte de IVA de lo cobrado
    expect(entrySalesVat(posEntry({ amounts: { cash: 400, card: 600, online: 184.5 } }), 10)).toBe(cents((1184.5 * 123.34) / 1234.5));
    expect(entrySalesVat(manual({ amounts: { cash: 110 } }), 10)).toBe(10);
  });

  it('sin IVA, sin los pagos de impuestos y con el impuesto de sociedades', () => {
    const day: BusinessDay = { id: '2027-03-13', status: 'closed', entries: { e1: manual({ amounts: { card: 33000 } }) } };
    const expenses: BusinessExpense[] = [
      { id: 'a', date: '2027-03-01', amount: 8800, typeId: 'ingredients', typeName: '', by: 'u1', createdAt: '' },
      { id: 'b', date: '2027-03-01', amount: 1210, typeId: 'rent', typeName: '', by: 'u1', createdAt: '' },
      { id: 'c', date: '2027-03-01', amount: 9000, typeId: 'payroll', typeName: '', by: 'u1', createdAt: '' },
      // El 303 del trimestre anterior: no es gasto aquí
      { id: 'd', date: '2027-03-01', amount: 2000, typeId: 'vat', typeName: '', by: 'u1', createdAt: '' },
    ];
    const t = taxEstimate([day], expenses, config());
    expect(t.salesBase).toBe(30000);
    expect(t.salesVat).toBe(3000);
    expect(t.expensesBase).toBe(8000 + 1000 + 9000);
    expect(t.expensesVat).toBe(800 + 210);
    expect(t.vatToPay).toBe(1990);
    expect(t.profitBeforeTax).toBe(12000);
    expect(t.corporateTax).toBe(1800);
    expect(t.realProfit).toBe(10200);
  });

  it('con pérdidas no hay impuesto de sociedades', () => {
    const t = taxEstimate([], [{ id: 'a', date: '2027-03-01', amount: 500, typeId: 'payroll', typeName: '', by: 'u1', createdAt: '' }], config());
    expect(t.corporateTax).toBe(0);
    expect(t.realProfit).toBe(-500);
  });

  it('sin IVA en Ajustes, todo cuenta entero y el 303 es un gasto más; sin sociedades, no se estima', () => {
    const day: BusinessDay = { id: '2027-03-13', status: 'closed', entries: { e1: manual({ amounts: { card: 11000 } }) } };
    const expenses: BusinessExpense[] = [
      { id: 'a', date: '2027-03-01', amount: 1210, typeId: 'rent', typeName: '', by: 'u1', createdAt: '' },
      { id: 'b', date: '2027-03-01', amount: 500, typeId: 'vat', typeName: '', by: 'u1', createdAt: '' },
    ];
    const noVat = taxEstimate([day], expenses, config({ vatEnabled: false }));
    expect(noVat).toMatchObject({ salesVat: 0, expensesVat: 0, vatToPay: 0, salesBase: 11000, expensesBase: 1710 });
    expect(noVat.corporateTax).toBe(cents((11000 - 1710) * 0.15));
    const noTaxes = taxEstimate([day], expenses, config({ vatEnabled: false, corporateTaxEnabled: false }));
    expect(noTaxes.corporateTax).toBe(0);
    expect(noTaxes.realProfit).toBe(9290);
    // Con los dos, el 303 no es gasto y el tipo se elige en Ajustes
    expect(taxEstimate([day], expenses, config({ corporateTaxRate: 25 })).corporateTax).toBe(cents((10000 - 1000) * 0.25));
  });

  it('el IVA escrito de la factura manda sobre el del tipo, si el IVA está puesto', () => {
    const expenses: BusinessExpense[] = [
      // Luz: 121 con 21 de IVA, como dice su tipo; alquiler: 1.150 de los que solo 150 son IVA
      { id: 'a', date: '2027-03-01', amount: 121, typeId: 'electricity', typeName: '', by: 'u1', createdAt: '' },
      { id: 'b', date: '2027-03-01', amount: 1150, vat: 150, typeId: 'rent', typeName: '', by: 'u1', createdAt: '' },
    ];
    const t = taxEstimate([], expenses, config());
    expect(t.expensesVat).toBe(21 + 150);
    expect(t.expensesBase).toBe(100 + 1000);
    // Sin IVA en Ajustes, todo entero
    expect(taxEstimate([], expenses, config({ vatEnabled: false }))).toMatchObject({ expensesVat: 0, expensesBase: 1271 });
  });

  it('parte lo pagado en base e IVA sin perder un céntimo', () => {
    expect(vatOfBase(1000, 21)).toBe(210);
    expect(vatOfBase(33.33, 10)).toBe(3.33);
    expect(splitAmount(1210, undefined, 21)).toEqual({ base: 1000, vat: 210 });
    expect(splitAmount(1210, 150, 21)).toEqual({ base: 1060, vat: 150 });
    expect(splitAmount(500, null, 0)).toEqual({ base: 500, vat: 0 });
    const odd = splitAmount(10.01, null, 21);
    expect(cents(odd.base + odd.vat)).toBe(10.01);
  });

  it('para qué cuenta cada tipo de gasto se cambia en Ajustes', () => {
    const c = config({
      expenseTypes: {
        ...config().expenseTypes,
        ingredients: { name: 'Materia prima', icon: 'basket', order: 1, vatRate: 10, role: 'none' },
        firewood: { name: 'Leña', icon: 'pricetag', order: 9, vatRate: 21, role: 'food' },
      },
    });
    const expenses: BusinessExpense[] = [
      { id: 'a', date: '2026-09-01', amount: 100, typeId: 'ingredients', typeName: '', by: 'u1', createdAt: '' },
      { id: 'b', date: '2026-09-01', amount: 40, typeId: 'firewood', typeName: '', by: 'u1', createdAt: '' },
      { id: 'c', date: '2026-09-01', amount: 900, typeId: 'payroll', typeName: '', by: 'u1', createdAt: '' },
    ];
    const s = monthSummary({ year: 2026, month0: 8, todayId: '2026-09-30', config: c, days: {}, expenses, recurring: [] });
    expect(s.foodCost).toBe(40);
    // Sin decir nada (una empresa de antes), lo de la plantilla: las nóminas son personal
    expect(s.staffCost).toBe(900);
  });

  it('cada mes es de su trimestre', () => {
    expect(quarterMonths(0)).toEqual([0, 1, 2]);
    expect(quarterMonths(10)).toEqual([9, 10, 11]);
  });

  it('una pizzería nueva nace con sus formas de cobro, sus tipos de gasto con IVA y sus impuestos', () => {
    const c = buildConfig();
    expect(Object.keys(c.channels)).toEqual(['cash', 'card', 'online']);
    expect(Object.keys(c.expenseTypes)).toEqual(EXPENSE_TYPES.map((x) => x.id));
    expect(c.expenseTypes.rent.vatRate).toBe(21);
    expect(c.expenseTypes.payroll).toMatchObject({ vatRate: 0, role: 'staff' });
    expect(c.expenseTypes.vat.role).toBe('vat');
    // Online es Stripe: 1,5 % y 0,25 € por cobro, que se cambian en Ajustes
    expect(c.channels.online).toMatchObject({ commissionPct: 1.5, commissionFixed: 0.25 });
    expect(c).toMatchObject({
      vatEnabled: true, salesVatRate: 10, corporateTaxEnabled: true, corporateTaxRate: 15,
      foodCostTarget: 30, staffCostTarget: 35, cashCount: true,
    });
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

  it('el IVA escrito del fijo pasa a cada gasto; sin él, no lleva', () => {
    const [withVat] = dueRecurringExpenses([{ ...rent, vat: 208.26 }], new Set(), new Date(2026, 7, 31), 'u1');
    expect(withVat.vat).toBe(208.26);
    const [without] = dueRecurringExpenses([rent], new Set(), new Date(2026, 7, 31), 'u1');
    expect('vat' in without).toBe(false);
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

// ── Orden por uso ────────────────────────────────────────────────

describe('orden por uso', () => {
  const types = ['ingredients', 'rent', 'payroll', 'electricity', 'commissions'].map((id) => ({ id }));
  const expense = (id: string, typeId: string, over: Partial<BusinessExpense> = {}) => ({ id, typeId, recurringId: null, ...over });

  it('al apuntar un gasto, el tipo más usado a mano va primero; a igualdad, el orden de la lista', () => {
    const sorted = expenseTypesByUse(types, [
      expense('a', 'electricity'), expense('b', 'electricity'), expense('c', 'payroll'),
      // Las comisiones y los gastos de los fijos se apuntan solos: no cuentan
      expense(commissionExpenseId('2027-03-13', 'online'), 'commissions'),
      expense(commissionExpenseId('2027-03-14', 'online'), 'commissions'),
      expense(commissionExpenseId('2027-03-15', 'online'), 'commissions'),
      expense('rec_r1_202703', 'rent', { recurringId: 'r1' }),
      expense('rec_r1_202704', 'rent', { recurringId: 'r1' }),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(['electricity', 'payroll', 'ingredients', 'rent', 'commissions']);
    // Sin nada apuntado, el orden de la lista
    expect(expenseTypesByUse(types, []).map((x) => x.id)).toEqual(types.map((x) => x.id));
  });

  it('al apuntar un fijo, los tipos de los fijos van primero y, sin fijos, los que suelen serlo', () => {
    expect(recurringTypesByUse(types, []).map((x) => x.id)).toEqual(['rent', 'payroll', 'electricity', 'ingredients', 'commissions']);
    expect(recurringTypesByUse(types, [{ typeId: 'electricity' }]).map((x) => x.id))
      .toEqual(['electricity', 'rent', 'payroll', 'ingredients', 'commissions']);
  });
});

// ── Resumen por bloques ──────────────────────────────────────────

describe('resumen por bloques', () => {
  it('sin elegir nada, los de partida; lo elegido, en su orden, sin repetidos ni los que no conoce', () => {
    expect(summaryLayout({})).toEqual([...DEFAULT_SUMMARY_BLOCKS]);
    expect(summaryLayout({ summaryBlocks: ['days', 'vat', 'days', 'radar'] })).toEqual(['days', 'vat']);
    // Quitados todos, vacío (no vuelve a los de partida)
    expect(summaryLayout({ summaryBlocks: [] })).toEqual([]);
  });

  it('se sube, se baja, se quita y se añade al final', () => {
    const layout = summaryLayout({});
    expect(layout).toEqual(['taxes', 'vat', 'costs', 'whereItGoes']);
    expect(moveBlock(layout, 'vat', -1)).toEqual(['vat', 'taxes', 'costs', 'whereItGoes']);
    expect(moveBlock(layout, 'taxes', -1)).toEqual(layout);
    expect(moveBlock(layout, 'whereItGoes', 1)).toEqual(layout);
    expect(removeBlock(layout, 'costs')).toEqual(['taxes', 'vat', 'whereItGoes']);
    expect(addBlock(layout, 'days')).toEqual([...layout, 'days']);
    expect(addBlock(layout, 'vat')).toEqual(layout);
    expect(hiddenBlocks(layout)).toEqual(['days', 'payments', 'tickets', 'weekdays', 'suppliers']);
  });
});

// ── Resumen del mes ──────────────────────────────────────────────

describe('resumen del mes', () => {
  const c = config({ openDays: [1, 2, 3, 4, 5, 6] });
  const days: Record<string, BusinessDay> = {
    '2026-09-01': {
      id: '2026-09-01', status: 'closed', closedBy: 'pos',
      entries: { pos: posEntry({ amounts: { cash: 600, card: 400 }, tickets: 80, float: 100, counted: 698, pending: 25, vat: [] }) },
    },
    '2026-09-02': {
      id: '2026-09-02', status: 'closed', closedBy: 'u1',
      entries: { e1: manual({ amounts: { card: 800 }, manual: [{ id: 'm', name: 'Encargo', amount: 0 }] }) },
    },
  };
  const expenses: BusinessExpense[] = [
    { id: 'x1', date: '2026-09-01', amount: 440, typeId: 'ingredients', typeName: 'Materia prima', supplierId: 's1', supplierName: 'Makro', by: 'u1', createdAt: '' },
    { id: 'x2', date: '2026-09-01', amount: 1300, typeId: 'rent', typeName: 'Alquiler', recurringId: 'r1', by: 'u1', createdAt: '' },
    { id: 'x3', date: '2026-09-02', amount: 460, typeId: 'payroll', typeName: 'Nóminas', by: 'u1', createdAt: '' },
    { id: 'x4', date: '2026-08-31', amount: 50, typeId: 'ingredients', typeName: 'Materia prima', by: 'u1', createdAt: '' },
  ];
  const recurring: BusinessRecurring[] = [
    { id: 'r1', name: 'Alquiler', amount: 1300, typeId: 'rent', typeName: 'Alquiler', day: 1, active: true, by: 'u1', createdAt: new Date(2026, 0, 1).toISOString() },
    { id: 'r2', name: 'Luz', amount: 260, typeId: 'electricity', typeName: 'Luz', day: 15, active: true, by: 'u1', createdAt: new Date(2026, 0, 1).toISOString() },
  ];
  const summary = monthSummary({ year: 2026, month0: 8, todayId: '2026-09-30', config: c, days, expenses, recurring });

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
    // El día 1: 1.000 vendidos menos 440 de Makro menos su parte de los fijos (1.560 / 26)
    expect(summary.days[0].result).toBe(cents(1000 - 440 - 60));
    expect(summary.days[0].fromPos).toBe(true);
    expect(summary.days[1].fromPos).toBe(false);
  });

  it('saca cómo pagan, tickets, descuadres, lo pendiente, proveedores y costes', () => {
    expect(Object.fromEntries(summary.byChannel.map((x) => [x.key, x.amount]))).toEqual({ card: 1200, cash: 600 });
    expect(summary.tickets).toBe(80);
    expect(summary.avgTicket).toBe(12.5);
    expect(summary.cashDiff).toBe(-2);
    expect(summary.pendingSales).toBe(25);
    expect(summary.bySupplier).toEqual([{ key: 's1', name: 'Makro', amount: 440, count: 1 }]);
    expect(summary.byType.map((x) => x.key)).toEqual(['rent', 'payroll', 'ingredients']);
    expect(summary.foodCost).toBe(440);
    expect(summary.staffCost).toBe(460);
    // Sin IVA: 1.636,36 vendidos (al 10 %) menos 1.934,38 gastados, y con pérdidas no hay sociedades
    expect(summary.taxes).toMatchObject({ salesBase: 1636.36, expensesBase: 1934.38, corporateTax: 0, realProfit: -298.02 });
    expect(summary.taxes.vatToPay).toBe(-101.98);
  });

  it('sin repartir, los fijos cuentan el día que se pagan', () => {
    const plain = monthSummary({
      year: 2026, month0: 8, todayId: '2026-09-30', config: { ...c, spreadFixed: false }, days, expenses, recurring,
    });
    expect(plain.days[0].result).toBe(cents(1000 - 440 - 1300));
    expect(plain.days[1].fixedShare).toBe(0);
  });
});
