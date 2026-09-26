import { getDateLocale } from './dateFormat';
import { formatAmount } from './formatAmount';

export interface DayGroup<T> {
  key: string;
  date: Date;
  items: T[];
  income: number;
  expense: number;
}

interface Dated {
  date: string;
  type: string;
  amount: number;
}

/** Agrupa por día, en el orden en que llegan (se esperan ya ordenados del más reciente) */
export const groupByDay = <T extends Dated>(items: T[]): DayGroup<T>[] => {
  const groups: DayGroup<T>[] = [];
  items.forEach((item) => {
    const d = new Date(item.date);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), items: [], income: 0, expense: 0 };
      groups.push(group);
    }
    group.items.push(item);
    if (item.type === 'income') group.income += item.amount;
    else group.expense += item.amount;
  });
  return groups;
};

/** "Hoy", "Ayer" o "Jueves, 24 sept" en el idioma de la app */
export const dayLabel = (
  date: Date,
  t: (key: string) => string,
  language: string | undefined,
): string => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((today - date.getTime()) / 86400000);
  if (diff === 0) return t('home.today');
  if (diff === 1) return t('home.yesterday');
  const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'short' };
  if (date.getFullYear() !== now.getFullYear()) options.year = 'numeric';
  const text = date.toLocaleDateString(getDateLocale(language), options);
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** Total de un día para su cabecera: lo gastado, o lo que entró si no hubo gastos */
export const dayTotalLabel = (group: { income: number; expense: number }, currencySymbol: string): string =>
  group.expense > 0
    ? `-${formatAmount(group.expense)} ${currencySymbol}`
    : `+${formatAmount(group.income)} ${currencySymbol}`;
