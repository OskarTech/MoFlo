import { commissionExpenseId, dayCommissions, madridDayId, parsePosClose, posEntry, sameEntry } from '../pos';
import { dayCommissions as appCommissions } from '../../../src/business/logic/commissions';

// El cierre de caja que manda el TPV: el ejemplo del mensaje (versión 1). Ahora
// son las 00:30 del 14 en Madrid: se acepta hasta el 15
const NOW = Date.UTC(2027, 2, 13, 23, 30);
const message = (over: Record<string, unknown> = {}) => ({
  v: 1,
  day: '2027-03-13',
  closedAt: Date.UTC(2027, 2, 13, 23, 0),
  byPayment: { cash: 45000, card: 60000, online: 18450 },
  pending: 0,
  total: 123450,
  tickets: 37,
  vat: [{ rate: 10, base: 100000, vat: 10000 }, { rate: 21, base: 11116, vat: 2334 }],
  float: 10000,
  counted: 55000,
  ...over,
});
const parse = (over: Record<string, unknown> = {}) => parsePosClose(message(over), NOW);
const errorOf = (over: Record<string, unknown>) => {
  const result = parse(over);
  return result.ok ? null : result.error;
};

describe('el mensaje del cierre de caja', () => {
  it('lee el del ejemplo', () => {
    const result = parse();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.close).toMatchObject({ day: '2027-03-13', tickets: 37, float: 10000, counted: 55000, countByPayment: null });
  });

  it('rechaza lo que no cuadra o no es razonable', () => {
    expect(parsePosClose(null, NOW)).toEqual({ ok: false, error: 'body' });
    expect(parsePosClose([], NOW)).toEqual({ ok: false, error: 'body' });
    expect(errorOf({ v: 2 })).toBe('v');
    expect(errorOf({ day: '13/03/2027' })).toBe('day');
    expect(errorOf({ day: '2027-02-30' })).toBe('day');
    expect(errorOf({ day: '2027-03-16' })).toBe('day-future');
    expect(errorOf({ day: '2025-01-01' })).toBe('day-old');
    expect(errorOf({ closedAt: '2027-03-13' })).toBe('closedAt');
    expect(errorOf({ closedAt: NOW + 3 * 24 * 3600 * 1000 })).toBe('closedAt');
    expect(errorOf({ byPayment: { cash: 450.5, card: 60000, online: 18450 } })).toBe('byPayment.cash');
    expect(errorOf({ byPayment: { cash: 45000, card: 60000, online: 18450, bizum: 10 } })).toBe('byPayment');
    expect(errorOf({ byPayment: { cash: 1e12, card: 0, online: 0 } })).toBe('byPayment.cash');
    expect(errorOf({ total: 123451 })).toBe('total-mismatch');
    expect(errorOf({ pending: -5 })).toBe('pending');
    expect(errorOf({ tickets: 3.5 })).toBe('tickets');
    expect(errorOf({ vat: [{ rate: 10, base: 1.5, vat: 0 }] })).toBe('vat.amount');
    expect(errorOf({ vat: [{ rate: 150, base: 0, vat: 0 }] })).toBe('vat.rate');
    expect(errorOf({ float: -1 })).toBe('float');
    expect(errorOf({ countByPayment: { online: -1 } })).toBe('countByPayment.online');
  });

  it('acepta un día con más devoluciones que ventas, el de mañana y lo pendiente en el total', () => {
    expect(errorOf({ byPayment: { cash: 1000, card: -3000, online: 0 }, total: -2000, vat: [] })).toBeNull();
    expect(errorOf({ day: '2027-03-15' })).toBeNull();
    expect(errorOf({ pending: 550, total: 124000 })).toBeNull();
    expect(errorOf({ float: null, counted: undefined })).toBeNull();
  });

  it('el día va en hora de Madrid', () => {
    // 23:30 del 13 en UTC ya es el 14 en Madrid (en marzo, UTC+1)
    expect(madridDayId(Date.UTC(2027, 2, 13, 23, 30))).toBe('2027-03-14');
    expect(madridDayId(Date.UTC(2027, 6, 1, 21, 59))).toBe('2027-07-01');
  });
});

describe('la entrada del día', () => {
  it('pasa los céntimos a euros, con los nombres de las formas de cobro', () => {
    const result = parse({ pending: 550, total: 124000, countByPayment: { online: 12 } });
    if (!result.ok) throw new Error(result.error);
    const entry = posEntry(result.close, { cash: 'Efectivo', card: 'Tarjeta', online: 'Online' });
    expect(entry).toMatchObject({
      id: 'pos',
      amounts: { cash: 450, card: 600, online: 184.5 },
      channelNames: { cash: 'Efectivo', card: 'Tarjeta', online: 'Online' },
      tickets: 37, float: 100, counted: 550, pending: 5.5,
      vat: [{ rate: 10, base: 1000, vat: 100 }, { rate: 21, base: 111.16, vat: 23.34 }],
      counts: { cash: 0, card: 0, online: 12 },
      by: 'pos',
      at: '2027-03-13T23:00:00.000Z',
    });
  });

  it('sin una forma de cobro, no la pone; y el mismo cierre otra vez es igual', () => {
    const result = parse({ byPayment: { cash: 45000, card: 0, online: 0 }, total: 45000 });
    if (!result.ok) throw new Error(result.error);
    const entry = posEntry(result.close, {});
    expect(entry.amounts).toEqual({ cash: 450 });
    expect(entry.counts).toBeUndefined();
    const again = JSON.parse(JSON.stringify(entry));
    expect(sameEntry(entry, { ...again, amounts: { cash: 450 } })).toBe(true);
    expect(sameEntry(entry, { ...again, tickets: 38 })).toBe(false);
  });
});

describe('las comisiones', () => {
  const channels = {
    cash: {},
    card: { commissionPct: 0.5 },
    online: { commissionPct: 1.5, commissionFixed: 0.25 },
    extra: { commissionPct: 30 },
  };
  type Entry = { amounts: Record<string, number>; counts?: Record<string, number> };
  const cases: Entry[][] = [
    [{ amounts: { cash: 450, card: 600, online: 184.5 } }],
    [{ amounts: { cash: 450, card: 600, online: 184.5 }, counts: { online: 12 } }, { amounts: { card: 200, extra: 96 } }],
    [{ amounts: { cash: 10, card: -40, online: -5 }, counts: { online: 2 } }],
    [],
  ];

  it('dan lo mismo que en la app, con los mismos ids', () => {
    for (const entries of cases) expect(dayCommissions(entries, channels)).toEqual(appCommissions(entries, channels));
    expect(dayCommissions(cases[1], channels)).toEqual({ cash: 0, card: 4, online: 5.77, extra: 28.8 });
    expect(commissionExpenseId('2027-03-13', 'card')).toBe('com_20270313_card');
  });
});
