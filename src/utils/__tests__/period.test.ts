import {
  normalizeStartDay, periodIndexOf, periodRange, periodLength, dayOfPeriod, periodDay, formatPeriodRange,
} from '../period';

const idx = (year: number, month1: number) => year * 12 + (month1 - 1);
const day = (year: number, month1: number, d: number, h = 12, min = 0) => new Date(year, month1 - 1, d, h, min);
const ymd = (date: Date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

// Todos los días entre dos fechas, a las 12:00
const everyDay = (from: Date, to: Date) => {
  const days: Date[] = [];
  for (let d = new Date(from); d <= to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12)) {
    days.push(d);
  }
  return days;
};

describe('normalizeStartDay', () => {
  it('acepta del 1 al 31', () => {
    expect(normalizeStartDay(1)).toBe(1);
    expect(normalizeStartDay(24)).toBe(24);
    expect(normalizeStartDay(31)).toBe(31);
  });

  it('cualquier otra cosa es el 1, como hasta ahora', () => {
    for (const value of [0, 32, -3, 1.5, '24', null, undefined, NaN]) {
      expect(normalizeStartDay(value)).toBe(1);
    }
  });
});

describe('periodos con el día 1', () => {
  it('son exactamente los meses naturales', () => {
    for (const d of everyDay(day(2023, 1, 1), day(2028, 12, 31))) {
      for (const [h, min] of [[0, 0], [12, 0], [23, 59]]) {
        const date = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, min);
        expect(periodIndexOf(date, 1)).toBe(date.getFullYear() * 12 + date.getMonth());
      }
    }
  });

  it('van del día 1 al primero del mes siguiente', () => {
    for (let i = idx(2024, 1); i <= idx(2027, 12); i++) {
      const { start, end } = periodRange(i, 1);
      const year = Math.floor(i / 12);
      const month0 = i % 12;
      expect(start).toEqual(new Date(year, month0, 1));
      expect(end).toEqual(new Date(year, month0 + 1, 1));
    }
  });

  it('el día por defecto es el 1', () => {
    expect(periodIndexOf(day(2026, 10, 5))).toBe(idx(2026, 10));
    expect(periodRange(idx(2026, 10)).start).toEqual(new Date(2026, 9, 1));
  });
});

describe('periodos que empiezan el 24', () => {
  it('del 24 de septiembre al 23 de octubre es octubre', () => {
    expect(periodIndexOf(day(2026, 9, 24, 0, 0), 24)).toBe(idx(2026, 10));
    expect(periodIndexOf(day(2026, 10, 5), 24)).toBe(idx(2026, 10));
    expect(periodIndexOf(day(2026, 10, 23, 23, 59), 24)).toBe(idx(2026, 10));
    expect(periodIndexOf(day(2026, 10, 24, 0, 0), 24)).toBe(idx(2026, 11));
    expect(periodIndexOf(day(2026, 9, 23, 23, 59), 24)).toBe(idx(2026, 9));

    const range = periodRange(idx(2026, 10), 24);
    expect(range.start).toEqual(new Date(2026, 8, 24));
    expect(range.end).toEqual(new Date(2026, 9, 24));
    expect(periodLength(range)).toBe(30);
  });

  it('el de enero empieza el 24 de diciembre del año anterior', () => {
    expect(periodIndexOf(day(2026, 12, 24), 24)).toBe(idx(2027, 1));
    expect(periodIndexOf(day(2026, 12, 23), 24)).toBe(idx(2026, 12));
    expect(periodIndexOf(day(2027, 1, 23), 24)).toBe(idx(2027, 1));
    expect(periodRange(idx(2027, 1), 24)).toEqual({ start: new Date(2026, 11, 24), end: new Date(2027, 0, 24) });
  });

  it('se escribe del primer al último día', () => {
    expect(formatPeriodRange(periodRange(idx(2026, 10), 24), 'en-US')).toBe('Sep 24 – Oct 23');
    expect(formatPeriodRange(periodRange(idx(2026, 10), 1), 'en-US')).toBe('Oct 1 – Oct 31');
  });
});

describe('nombre del periodo', () => {
  it('del 1 al 15, el mes en el que empieza', () => {
    expect(periodIndexOf(day(2026, 10, 4), 5)).toBe(idx(2026, 9));
    expect(periodIndexOf(day(2026, 10, 5), 5)).toBe(idx(2026, 10));
    expect(periodIndexOf(day(2026, 10, 15), 15)).toBe(idx(2026, 10));
    expect(periodRange(idx(2026, 10), 5)).toEqual({ start: new Date(2026, 9, 5), end: new Date(2026, 10, 5) });
  });

  it('del 16 al 31, el mes en el que acaba', () => {
    expect(periodIndexOf(day(2026, 10, 16), 16)).toBe(idx(2026, 11));
    expect(periodIndexOf(day(2026, 10, 15), 16)).toBe(idx(2026, 10));
    expect(periodRange(idx(2026, 11), 16)).toEqual({ start: new Date(2026, 9, 16), end: new Date(2026, 10, 16) });
  });
});

describe('meses sin el día elegido', () => {
  it('con el 31, febrero empieza el 28 y abril el 30', () => {
    // 2027 no es bisiesto
    expect(periodIndexOf(day(2027, 2, 27), 31)).toBe(idx(2027, 2));
    expect(periodIndexOf(day(2027, 2, 28), 31)).toBe(idx(2027, 3));
    expect(periodIndexOf(day(2027, 3, 30), 31)).toBe(idx(2027, 3));
    expect(periodIndexOf(day(2027, 3, 31), 31)).toBe(idx(2027, 4));
    expect(periodIndexOf(day(2027, 4, 30), 31)).toBe(idx(2027, 5));

    expect(periodRange(idx(2027, 2), 31)).toEqual({ start: new Date(2027, 0, 31), end: new Date(2027, 1, 28) });
    expect(periodRange(idx(2027, 3), 31)).toEqual({ start: new Date(2027, 1, 28), end: new Date(2027, 2, 31) });
    expect(periodRange(idx(2027, 5), 31)).toEqual({ start: new Date(2027, 3, 30), end: new Date(2027, 4, 31) });
  });

  it('en año bisiesto, febrero empieza el 29', () => {
    expect(periodIndexOf(day(2028, 2, 28), 30)).toBe(idx(2028, 2));
    expect(periodIndexOf(day(2028, 2, 29), 30)).toBe(idx(2028, 3));
    expect(periodRange(idx(2028, 3), 30).start).toEqual(new Date(2028, 1, 29));
    expect(periodRange(idx(2028, 3), 29).start).toEqual(new Date(2028, 1, 29));
    expect(periodRange(idx(2027, 3), 29).start).toEqual(new Date(2027, 1, 28));
  });
});

describe('con cualquier día de inicio', () => {
  const days = everyDay(day(2025, 11, 1), day(2028, 3, 31));

  it.each(Array.from({ length: 31 }, (_, i) => i + 1))('el %i: cada día cae en su periodo, sin huecos ni solapes', (startDay) => {
    let previous: number | null = null;
    for (const date of days) {
      const index = periodIndexOf(date, startDay);
      const range = periodRange(index, startDay);
      expect(range.start.getTime()).toBeLessThanOrEqual(date.getTime());
      expect(date.getTime()).toBeLessThan(range.end.getTime());
      // Seguidos: cada periodo acaba donde empieza el siguiente
      expect(periodRange(index + 1, startDay).start).toEqual(range.end);
      // De un día al siguiente, el mismo periodo o el siguiente
      if (previous !== null) expect([previous, previous + 1]).toContain(index);
      previous = index;
      const length = periodLength(range);
      expect(length).toBeGreaterThanOrEqual(28);
      expect(length).toBeLessThanOrEqual(31);
    }
  });
});

describe('días dentro del periodo', () => {
  it('cuentan desde el primero, también con el cambio de hora', () => {
    // 29 de marzo de 2026: en Madrid ese día tiene 23 horas
    const range = periodRange(idx(2026, 4), 24);
    expect(ymd(range.start)).toBe('2026-3-24');
    expect(periodLength(range)).toBe(31);
    expect(dayOfPeriod(day(2026, 3, 24, 0, 0), range)).toBe(0);
    expect(dayOfPeriod(day(2026, 3, 30, 9), range)).toBe(6);
    expect(dayOfPeriod(day(2026, 4, 23, 23, 59), range)).toBe(30);
    expect(ymd(periodDay(range, 6))).toBe('2026-3-30');
    expect(ymd(periodDay(range, 30))).toBe('2026-4-23');

    // 25 de octubre de 2026: 25 horas
    const october = periodRange(idx(2026, 11), 24);
    expect(periodLength(october)).toBe(31);
    expect(dayOfPeriod(day(2026, 10, 26, 8), october)).toBe(2);
  });

  it('con el día 1, el día del periodo es el día del mes menos uno', () => {
    const range = periodRange(idx(2026, 10), 1);
    for (let d = 1; d <= 31; d++) {
      expect(dayOfPeriod(day(2026, 10, d, 18), range)).toBe(d - 1);
      expect(periodDay(range, d - 1).getDate()).toBe(d);
    }
  });
});
