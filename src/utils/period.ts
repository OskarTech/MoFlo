/**
 * El mes de cada cuenta puede empezar otro día que el 1: quien cobra el 24
 * cuenta su mes del 24 al 23 del siguiente (Ajustes > Inicio del mes).
 *
 * - Cada periodo se llama como el mes que tiene más días suyos: empezando del
 *   1 al 15, el mes en el que empieza; del 16 al 31, el mes en el que acaba
 *   (del 24 de septiembre al 23 de octubre es «Octubre»).
 * - Si un mes no tiene el día elegido (31 en abril, 30 en febrero), empieza el
 *   último día de ese mes, como los fijos.
 * - Se identifica con el índice de siempre del mes que le da nombre (año * 12
 *   + mes 0-11). Con el día 1 es exactamente el mes natural, así que lo que ya
 *   contaba los meses así sigue igual.
 */

const DAY_MS = 86400000;

export interface PeriodRange {
  /** El primer día, a las 00:00 */
  start: Date;
  /** El primer día del periodo siguiente, a las 00:00 */
  end: Date;
}

/** El día guardado, de 1 a 31; cualquier otra cosa (o nada) es el 1 */
export const normalizeStartDay = (day: unknown): number =>
  (typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= 31 ? day : 1);

const daysInMonth = (year: number, month0: number) => new Date(year, month0 + 1, 0).getDate();

// Día en que empieza el periodo dentro de ese mes: el elegido o, si el mes no
// lo tiene, el último que tenga
const startDayIn = (year: number, month0: number, startDay: number) =>
  Math.min(startDay, daysInMonth(year, month0));

// Empezando del 16 en adelante tiene más días en el mes en que acaba
const nameShift = (startDay: number) => (startDay >= 16 ? 1 : 0);

/** Índice (año * 12 + mes 0-11) del periodo al que pertenece la fecha */
export const periodIndexOf = (date: Date, startDay = 1): number => {
  const year = date.getFullYear();
  const month0 = date.getMonth();
  const calendar = year * 12 + month0;
  if (startDay <= 1) return calendar;
  const started = date.getDate() >= startDayIn(year, month0, startDay);
  return (started ? calendar : calendar - 1) + nameShift(startDay);
};

// Comienzo del periodo que empieza en el mes natural de ese índice
const startOfMonthIndex = (index: number, startDay: number) => {
  const year = Math.floor(index / 12);
  const month0 = index - year * 12;
  return new Date(year, month0, startDay <= 1 ? 1 : startDayIn(year, month0, startDay));
};

/** Primer día del periodo y primero del siguiente */
export const periodRange = (index: number, startDay = 1): PeriodRange => {
  const first = startDay <= 1 ? index : index - nameShift(startDay);
  return { start: startOfMonthIndex(first, startDay), end: startOfMonthIndex(first + 1, startDay) };
};

const midnight = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Días que tiene el periodo */
export const periodLength = (range: PeriodRange): number =>
  // Redondeado: el día del cambio de hora tiene 23 o 25 horas
  Math.round((range.end.getTime() - range.start.getTime()) / DAY_MS);

/** Qué día del periodo es la fecha: 0 el primero (negativo o pasado el último, si cae fuera) */
export const dayOfPeriod = (date: Date, range: PeriodRange): number =>
  Math.round((midnight(date).getTime() - range.start.getTime()) / DAY_MS);

/** La fecha del día n del periodo (0, el primero) */
export const periodDay = (range: PeriodRange, n: number): Date =>
  new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate() + n);

/**
 * Del primer al último día, p. ej. "24 sept – 23 oct", con el formato de fecha
 * corto del idioma. Con withYear, también el año: "24 dic 2026 – 23 dic 2027"
 */
export const formatPeriodRange = (range: PeriodRange, locale: string, withYear = false): string => {
  const options: Intl.DateTimeFormatOptions = withYear
    ? { day: 'numeric', month: 'short', year: 'numeric' }
    : { day: 'numeric', month: 'short' };
  const format = (date: Date) => date.toLocaleDateString(locale, options);
  return `${format(range.start)} – ${format(periodDay(range, periodLength(range) - 1))}`;
};
