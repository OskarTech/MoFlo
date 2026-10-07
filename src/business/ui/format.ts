import type { TFunction } from 'i18next';
import type { IconName } from '../../components/common/Icon';
import { getDateLocale } from '../../utils/dateFormat';
import { dateOfDayId, dayIdOfDate, shiftDayId } from '../logic/basics';
import { ChannelKind } from '../types';

/** El icono de una forma de cobro */
export const channelIcon = (kind: ChannelKind | undefined): IconName =>
  (kind === 'cash' ? 'cash-outline' : kind === 'card' ? 'card-outline' : 'phone-portrait-outline');

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** «Hoy», «Ayer» o «Miércoles, 7 oct» */
export const dayTitle = (dayId: string, t: TFunction, language: string | undefined, todayId = dayIdOfDate(new Date())): string => {
  if (dayId === todayId) return t('home.today');
  if (dayId === shiftDayId(todayId, -1)) return t('home.yesterday');
  const date = dateOfDayId(dayId);
  const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'short' };
  if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
  return capitalize(date.toLocaleDateString(getDateLocale(language), options));
};

/** «Mié 7»: para listas */
export const shortDay = (dayId: string, language: string | undefined): string =>
  capitalize(dateOfDayId(dayId).toLocaleDateString(getDateLocale(language), { weekday: 'short', day: 'numeric' }));

/** «Octubre» o, si no es de este año, «Octubre 2025» */
export const monthTitle = (year: number, month0: number, t: TFunction): string =>
  (year === new Date().getFullYear() ? t(`home.month_${month0}`) : `${t(`home.month_${month0}`)} ${year}`);

/** «21:42» */
export const timeOf = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** La inicial del día de la semana (0 domingo … 6 sábado) en el idioma de la app */
export const weekdayLetter = (weekday: number, language: string | undefined): string => {
  // Un domingo cualquiera más los días que falten
  const date = new Date(2024, 0, 7 + weekday);
  return capitalize(date.toLocaleDateString(getDateLocale(language), { weekday: 'short' })).replace('.', '');
};

/** «miércoles, 7 oct»: la fecha entera, en minúscula para ir detrás de otro texto */
export const longDay = (dayId: string, language: string | undefined): string =>
  dateOfDayId(dayId).toLocaleDateString(getDateLocale(language), { weekday: 'long', day: 'numeric', month: 'short' });
