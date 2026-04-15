import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Movement } from '../types';
import { useCategoryStore } from '../store/categoryStore';

const escapeCSV = (value: string) => {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

export const exportMovementsToCSV = async (
  movements: Movement[],
  t: (key: string) => string
): Promise<void> => {
  const { getCategoryName } = useCategoryStore.getState();

  const headers = [
    t('export.date'),
    t('export.type'),
    t('export.category'),
    t('export.amount'),
    t('export.currency'),
    t('export.recurring'),
  ].join(',');

  const rows = [...movements]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map((m) => {
      const date = new Date(m.date).toLocaleDateString();
      const type = t(`movements.${m.type}`);
      const category = getCategoryName(m.category, m.type, t);
      const amount = m.type === 'income'
        ? `+${m.amount.toFixed(2)}`
        : `-${m.amount.toFixed(2)}`;
      const currency = m.currency ?? 'EUR';
      const recurring = m.isRecurring ? t('export.yes') : t('export.no');

      return [
        escapeCSV(date),
        escapeCSV(type),
        escapeCSV(category),
        escapeCSV(amount),
        escapeCSV(currency),
        escapeCSV(recurring),
      ].join(',');
    });

  const csv = [headers, ...rows].join('\n');
  const fileName = `moflo_export_${new Date().toISOString().split('T')[0]}.csv`;
  const fileUri = `${FileSystem.documentDirectory}${fileName}`;

  await FileSystem.writeAsStringAsync(fileUri, csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  await Sharing.shareAsync(fileUri, {
    mimeType: 'text/csv',
    dialogTitle: 'MoFlo — Export CSV',
    UTI: 'public.comma-separated-values-text',
  });
};