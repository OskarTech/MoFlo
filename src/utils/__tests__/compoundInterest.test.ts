import { niceCeil, projectCompound } from '../compoundInterest';

describe('projectCompound', () => {
  it('da un punto por cada año, y ninguno con 0 años', () => {
    expect(projectCompound({ initial: 100, monthly: 10, annualRate: 5, years: 0 })).toEqual([]);
    expect(projectCompound({ initial: 100, monthly: 10, annualRate: 5, years: 5 }).map((y) => y.year))
      .toEqual([1, 2, 3, 4, 5]);
  });

  it('200 € al mes al 10 % son unos 2.534 € al acabar el primer año, no 2.400', () => {
    const [first] = projectCompound({ initial: 0, monthly: 200, annualRate: 10, years: 1 });
    expect(first.contributed).toBe(2400);
    expect(first.total).toBeCloseTo(2534.06, 2);
    expect(first.interest).toBeCloseTo(134.06, 2);
  });

  it('sin rentabilidad solo suma lo aportado, sin intereses', () => {
    const years = projectCompound({ initial: 1000, monthly: 100, annualRate: 0, years: 3 });
    expect(years.map((y) => y.total)).toEqual([2200, 3400, 4600]);
    expect(years.map((y) => y.contributed)).toEqual([2200, 3400, 4600]);
    expect(years.map((y) => y.interest)).toEqual([0, 0, 0]);
  });

  it('el importe inicial genera cada mes, también sobre lo ya ganado', () => {
    // Un 12 % al año es un 1 % cada mes
    const [first, second] = projectCompound({ initial: 1000, monthly: 0, annualRate: 12, years: 2 });
    expect(first.total).toBeCloseTo(1000 * 1.01 ** 12, 6);
    expect(second.total).toBeCloseTo(1000 * 1.01 ** 24, 6);
    expect(second.contributed).toBe(1000);
    expect(second.interest).toBeCloseTo(1000 * 1.01 ** 24 - 1000, 6);
  });

  it('las aportaciones, al principio de cada mes, dan lo de la fórmula de una renta', () => {
    const monthlyRate = 0.07 / 12;
    const months = 12 * 20;
    const expected = 200 * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate);
    const years = projectCompound({ initial: 0, monthly: 200, annualRate: 7, years: 20 });
    const last = years[years.length - 1];
    expect(last.total).toBeCloseTo(expected, 4);
    expect(last.contributed).toBe(48000);
    expect(last.interest).toBeCloseTo(expected - 48000, 4);
  });

  it('el importe inicial y las aportaciones se suman', () => {
    const both = projectCompound({ initial: 5000, monthly: 150, annualRate: 6, years: 10 });
    const onlyInitial = projectCompound({ initial: 5000, monthly: 0, annualRate: 6, years: 10 });
    const onlyMonthly = projectCompound({ initial: 0, monthly: 150, annualRate: 6, years: 10 });
    expect(both[9].total).toBeCloseTo(onlyInitial[9].total + onlyMonthly[9].total, 6);
  });

  it('los intereses nunca salen negativos por restos de coma flotante', () => {
    const years = projectCompound({ initial: 0.1, monthly: 0.7, annualRate: 0, years: 30 });
    expect(years.every((y) => y.interest === 0)).toBe(true);
  });
});

describe('niceCeil', () => {
  it.each([
    [128540, 150000],
    [49000, 50000],
    [150000, 150000],
    [1000, 1000],
    [1001, 1200],
    [7.3, 8],
    [910000, 1000000],
    [2_100_000, 2_500_000],
  ])('%p llega hasta %p', (value, expected) => {
    expect(niceCeil(value)).toBe(expected);
  });

  it('sin valores, un tope de 1', () => {
    expect(niceCeil(0)).toBe(1);
    expect(niceCeil(NaN)).toBe(1);
  });
});
