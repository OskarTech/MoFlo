import {
  advanceToNextMonth,
  clampDayToMonth,
  MAX_CONTRIBUTION_CATCH_UP,
  planAutomaticContributions,
} from '../automaticContributions';
import type { Hucha } from '../../types';

// Fecha local a las 12:00, como guarda la app las aportaciones
const noon = (year: number, monthIdx: number, day: number) =>
  new Date(year, monthIdx, day, 12).toISOString();

// [año, mes (0-11), día] en hora local de una fecha ISO
const localDay = (iso: string) => {
  const d = new Date(iso);
  return [d.getFullYear(), d.getMonth(), d.getDate()];
};

const makeHucha = (overrides: Partial<Hucha> = {}): Hucha => ({
  id: 'h1',
  name: 'Vacaciones',
  icon: 'airplane',
  color: '#00AAFF',
  targetAmount: 0,
  currentAmount: 0,
  isAutomatic: true,
  monthlyAmount: 50,
  recurringDay: 15,
  nextContributionDate: noon(2026, 0, 15),
  createdAt: noon(2025, 11, 1),
  ...overrides,
});

describe('clampDayToMonth', () => {
  it('deja el día si el mes lo tiene', () => {
    expect(clampDayToMonth(2026, 0, 15)).toBe(15);
    expect(clampDayToMonth(2026, 0, 31)).toBe(31);
  });

  it('usa el último día en los meses más cortos', () => {
    expect(clampDayToMonth(2026, 1, 31)).toBe(28);
    expect(clampDayToMonth(2028, 1, 31)).toBe(29); // bisiesto
    expect(clampDayToMonth(2026, 3, 31)).toBe(30);
  });
});

describe('advanceToNextMonth', () => {
  it('pasa al mismo día del mes siguiente, a las 12:00', () => {
    const next = advanceToNextMonth(noon(2026, 2, 15));
    expect(localDay(next)).toEqual([2026, 3, 15]);
    expect(new Date(next).getHours()).toBe(12);
  });

  it('en meses cortos usa el último día y después vuelve al día elegido', () => {
    const feb = advanceToNextMonth(noon(2026, 0, 31), 31);
    expect(localDay(feb)).toEqual([2026, 1, 28]);
    const mar = advanceToNextMonth(feb, 31);
    expect(localDay(mar)).toEqual([2026, 2, 31]);
  });

  it('cambia de año en diciembre', () => {
    expect(localDay(advanceToNextMonth(noon(2026, 11, 10), 10))).toEqual([2027, 0, 10]);
  });

  it('no repite el periodo con fechas antiguas guardadas a medianoche en otra zona horaria', () => {
    // 1 de octubre a las 00:00 en España visto desde Portugal: 30 de septiembre a las 23:00
    const next = advanceToNextMonth(new Date(2026, 8, 30, 23).toISOString(), 1);
    expect(localDay(next)).toEqual([2026, 10, 1]);
  });
});

describe('planAutomaticContributions', () => {
  it('ignora las huchas cerradas, manuales o sin datos de aportación', () => {
    const huchas = [
      makeHucha({ id: 'cerrada', closedAt: noon(2026, 0, 1) }),
      makeHucha({ id: 'manual', isAutomatic: false }),
      makeHucha({ id: 'sinImporte', monthlyAmount: undefined }),
      makeHucha({ id: 'importeCero', monthlyAmount: 0 }),
      makeHucha({ id: 'sinFecha', nextContributionDate: undefined }),
    ];
    expect(planAutomaticContributions(huchas, new Set(), new Date(2026, 5, 1))).toEqual([]);
  });

  it('no aporta antes del día que toca', () => {
    const plan = planAutomaticContributions([makeHucha()], new Set(), new Date(2026, 0, 14, 23, 59));
    expect(plan).toEqual([]);
  });

  it('aporta desde las 00:00 del día que toca, con todos los datos del apunte', () => {
    const now = new Date(2026, 0, 15, 8);
    const plan = planAutomaticContributions([makeHucha()], new Set(), now);

    expect(plan).toHaveLength(1);
    expect(plan[0]).toEqual({
      huchaId: 'h1',
      contribution: 50,
      nextDate: noon(2026, 1, 15),
      movement: {
        id: 'hm_auto_h1_2026-01-15',
        huchaId: 'h1',
        huchaName: 'Vacaciones',
        huchaColor: '#00AAFF',
        type: 'deposit',
        amount: 50,
        date: noon(2026, 0, 15),
        createdAt: now.toISOString(),
      },
    });
  });

  it('recupera todos los meses pendientes de una vez, en orden', () => {
    const plan = planAutomaticContributions([makeHucha()], new Set(), new Date(2026, 3, 20));

    expect(plan.map((c) => c.movement.id)).toEqual([
      'hm_auto_h1_2026-01-15',
      'hm_auto_h1_2026-02-15',
      'hm_auto_h1_2026-03-15',
      'hm_auto_h1_2026-04-15',
    ]);
    expect(plan.every((c) => c.contribution === 50)).toBe(true);
    // La siguiente queda para mayo
    expect(localDay(plan[plan.length - 1].nextDate)).toEqual([2026, 4, 15]);
  });

  it('recupera como mucho 12 meses por arranque y deja el resto para el siguiente', () => {
    const hucha = makeHucha({ nextContributionDate: noon(2025, 0, 15) });
    const plan = planAutomaticContributions([hucha], new Set(), new Date(2026, 5, 20));

    expect(MAX_CONTRIBUTION_CATCH_UP).toBe(12);
    expect(plan).toHaveLength(12);
    expect(localDay(plan[11].movement.date)).toEqual([2025, 11, 15]);
    // Sin saltarse ningún mes: el siguiente arranque sigue en enero de 2026
    expect(localDay(plan[11].nextDate)).toEqual([2026, 0, 15]);
  });

  it('con objetivo aporta solo lo que falta y se para al llegar', () => {
    const hucha = makeHucha({ targetAmount: 100, currentAmount: 80, monthlyAmount: 15 });
    const plan = planAutomaticContributions([hucha], new Set(), new Date(2026, 3, 20));
    expect(plan.map((c) => c.contribution)).toEqual([15, 5]);
  });

  it('no aporta nada si el objetivo ya está cumplido', () => {
    const hucha = makeHucha({ targetAmount: 100, currentAmount: 100 });
    expect(planAutomaticContributions([hucha], new Set(), new Date(2026, 3, 20))).toEqual([]);
  });

  it('no crea aportaciones de décimas de céntimo por redondeos', () => {
    const hucha = makeHucha({ targetAmount: 10, currentAmount: 9.999 });
    expect(planAutomaticContributions([hucha], new Set(), new Date(2026, 3, 20))).toEqual([]);
  });

  it('sin objetivo aporta siempre la cantidad mensual', () => {
    const hucha = makeHucha({ targetAmount: 0, currentAmount: 1_000_000 });
    const plan = planAutomaticContributions([hucha], new Set(), new Date(2026, 1, 20));
    expect(plan.map((c) => c.contribution)).toEqual([50, 50]);
  });

  it('se para en el primer mes que ya estaba aplicado', () => {
    const plan = planAutomaticContributions(
      [makeHucha()],
      new Set(['hm_auto_h1_2026-03-15']),
      new Date(2026, 3, 20),
    );
    expect(plan.map((c) => c.movement.id)).toEqual([
      'hm_auto_h1_2026-01-15',
      'hm_auto_h1_2026-02-15',
    ]);
  });

  it('con el día 31 aporta el último día de los meses cortos', () => {
    const hucha = makeHucha({ recurringDay: 31, nextContributionDate: noon(2026, 0, 31) });
    const plan = planAutomaticContributions([hucha], new Set(), new Date(2026, 4, 1));
    expect(plan.map((c) => localDay(c.movement.date))).toEqual([
      [2026, 0, 31],
      [2026, 1, 28],
      [2026, 2, 31],
      [2026, 3, 30],
    ]);
  });

  it('cada hucha lleva su propia cuenta', () => {
    const huchas = [
      makeHucha(),
      makeHucha({ id: 'h2', monthlyAmount: 20, recurringDay: 1, nextContributionDate: noon(2026, 2, 1) }),
    ];
    const plan = planAutomaticContributions(huchas, new Set(), new Date(2026, 3, 20));
    expect(plan.filter((c) => c.huchaId === 'h1')).toHaveLength(4);
    expect(plan.filter((c) => c.huchaId === 'h2').map((c) => c.contribution)).toEqual([20, 20]);
  });
});
