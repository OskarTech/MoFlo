/**
 * Piezas sueltas de la empresa: importes en céntimos, ids y días.
 *
 * Los días del negocio se guardan como texto AAAA-MM-DD en la hora del móvil.
 * Con hora de corte, lo apuntado de madrugada cuenta para el día anterior: un
 * bar que cierra a las 2 no parte la noche en dos días.
 */

/** Redondeado a céntimos: 0,1 + 0,2 da 0,3 y no 0,30000000000000004 */
export const cents = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export const sumOf = <T>(list: readonly T[], value: (item: T) => number): number =>
  cents(list.reduce((total, item) => total + (value(item) || 0), 0));

/** Un número que se puede guardar: finito y no negativo */
export const safeAmount = (n: unknown): number =>
  (typeof n === 'number' && Number.isFinite(n) && n > 0 ? cents(n) : 0);

/** Id corto y único para documentos y piezas de la configuración */
export const newId = (prefix: string): string =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const pad = (n: number) => String(n).padStart(2, '0');

export const dayIdOfDate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** El día del negocio de un momento: antes de la hora de corte, el anterior */
export const businessDayOf = (moment: Date, cutoffHour = 0): string => {
  const d = new Date(moment.getTime());
  if (cutoffHour > 0 && d.getHours() < cutoffHour) d.setDate(d.getDate() - 1);
  return dayIdOfDate(d);
};

export const dateOfDayId = (id: string): Date => {
  const [y, m, d] = id.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const isDayId = (id: unknown): id is string =>
  typeof id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(id) && dayIdOfDate(dateOfDayId(id)) === id;

export const shiftDayId = (id: string, days: number): string => {
  const d = dateOfDayId(id);
  d.setDate(d.getDate() + days);
  return dayIdOfDate(d);
};

/** AAAA-MM de un día */
export const monthKeyOfDay = (id: string): string => id.slice(0, 7);

export const monthKey = (year: number, month0: number): string => `${year}-${pad(month0 + 1)}`;

export const yearOfDay = (id: string): number => Number(id.slice(0, 4));

export const daysInMonth = (year: number, month0: number): number => new Date(year, month0 + 1, 0).getDate();

/** Los días de un mes, del 1 al último */
export const dayIdsOfMonth = (year: number, month0: number): string[] =>
  Array.from({ length: daysInMonth(year, month0) }, (_, i) => `${year}-${pad(month0 + 1)}-${pad(i + 1)}`);

/** Día de la semana (0 domingo … 6 sábado) de un día */
export const weekdayOfDay = (id: string): number => dateOfDayId(id).getDay();

/** Los elementos de una lista de la configuración, en su orden, sin los archivados (salvo que se pidan) */
export const orderedItems = <T extends { order: number; name: string; archived?: boolean }>(
  record: Record<string, T> | undefined | null,
  { withArchived = false }: { withArchived?: boolean } = {},
): (T & { id: string })[] =>
  Object.entries(record ?? {})
    .map(([id, item]) => ({ ...item, id }))
    .filter((item) => withArchived || !item.archived)
    .sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name));

/** El orden para una pieza nueva: detrás de las que hay */
export const nextOrder = (record: Record<string, { order: number }> | undefined | null): number =>
  Object.values(record ?? {}).reduce((max, item) => Math.max(max, item.order ?? 0), 0) + 1;
