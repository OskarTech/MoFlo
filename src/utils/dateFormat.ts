import { useSettingsStore } from '../store/settingsStore';
import { useSharedAccountStore } from '../store/sharedAccountStore';

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
