import { useSettingsStore } from '../store/settingsStore';
import { useSharedAccountStore } from '../store/sharedAccountStore';

// Locale de toLocaleDateString para cada idioma de la app. Antes cada pantalla
// solo distinguía polaco e inglés y el resto caía en español: en alemán,
// francés, italiano y portugués los días y los meses salían en español.
const DATE_LOCALES: Record<string, string> = {
  es: 'es-ES', en: 'en-US', pl: 'pl-PL', de: 'de-DE', fr: 'fr-FR', it: 'it-IT', pt: 'pt-PT',
};

export const getDateLocale = (language: string | undefined): string =>
  DATE_LOCALES[(language ?? '').split('-')[0]] ?? 'es-ES';

export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const { isSharedMode, sharedDateFormat } = useSharedAccountStore.getState();
  const { dateFormat } = useSettingsStore.getState();

  const format = isSharedMode ? sharedDateFormat : dateFormat;

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return format === 'MM/DD/YYYY'
    ? `${month}/${day}/${year}`
    : `${day}/${month}/${year}`;
};
