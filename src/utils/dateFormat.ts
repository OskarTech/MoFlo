import { useSettingsStore } from '../store/settingsStore';

export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const { dateFormat } = useSettingsStore.getState();

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return dateFormat === 'MM/DD/YYYY'
    ? `${month}/${day}/${year}`
    : `${day}/${month}/${year}`;
};