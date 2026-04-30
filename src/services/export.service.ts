import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Movement, Hucha } from '../types';
import { useCategoryStore } from '../store/categoryStore';

const escapeCSV = (value: string) => {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

export const exportMovementsToCSV = async (
  movements: Movement[],
  huchas: Hucha[],
  t: (key: string) => string,
  memberNames?: { [uid: string]: string }
): Promise<void> => {
  const { getCategoryName } = useCategoryStore.getState();
  const includeUser = !!memberNames;

  // ── MOVEMENTS ──────────────────────────────────────────────────
  const movHeaders = [
    ...(includeUser ? [t('export.user')] : []),
    t('export.date'),
    t('export.type'),
    t('export.category'),
    t('export.note'),
    t('export.amount'),
    t('export.currency'),
    t('export.recurring'),
  ].join(',');

  const movRows = [...movements]
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
      const note = m.note ?? '';
      const user = includeUser ? (m.addedBy ? memberNames![m.addedBy] ?? '' : '') : null;

      return [
        ...(includeUser ? [escapeCSV(user!)] : []),
        escapeCSV(date),
        escapeCSV(type),
        escapeCSV(category),
        escapeCSV(note),
        escapeCSV(amount),
        escapeCSV(currency),
        escapeCSV(recurring),
      ].join(',');
    });

  // ── HUCHAS ─────────────────────────────────────────────────────
  const huchaHeaders = [
    t('export.huchaName'),
    t('export.huchaSaved'),
    t('export.huchaGoal'),
    t('export.huchaProgress'),
    t('export.huchaTargetDate'),
    t('export.huchaAutomatic'),
    t('export.huchaMonthly'),
    t('export.huchaCreated'),
  ].join(',');

  const huchaRows = [...huchas]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((h) => {
      const progress = h.targetAmount > 0
        ? `${Math.min(100, Math.round((h.currentAmount / h.targetAmount) * 100))}%`
        : '0%';
      const targetDate = h.targetDate
        ? (() => { const [y, mo] = h.targetDate!.split('-'); return `${mo}/${y}`; })()
        : '-';
      const automatic = h.isAutomatic ? t('export.yes') : t('export.no');
      const monthly = h.isAutomatic && h.monthlyAmount ? h.monthlyAmount.toFixed(2) : '-';
      const created = new Date(h.createdAt).toLocaleDateString();

      return [
        escapeCSV(h.name),
        escapeCSV(h.currentAmount.toFixed(2)),
        escapeCSV(h.targetAmount.toFixed(2)),
        escapeCSV(progress),
        escapeCSV(targetDate),
        escapeCSV(automatic),
        escapeCSV(monthly),
        escapeCSV(created),
      ].join(',');
    });

  // ── COMBINE ────────────────────────────────────────────────────
  const lines: string[] = [movHeaders, ...movRows];

  if (huchas.length > 0) {
    lines.push('');
    lines.push(escapeCSV(t('export.huchasTitle')));
    lines.push(huchaHeaders);
    lines.push(...huchaRows);
  }

  const csv = lines.join('\n');
  const fileName = `moflo_export_${new Date().toISOString().split('T')[0]}.csv`;

  const file = new File(Paths.cache, fileName);
  // Idempotente: si existe de un export previo lo sobreescribimos.
  if (file.exists) file.delete();
  file.create();
  file.write(csv);

  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    dialogTitle: 'MoFlo — Export CSV',
    UTI: 'public.comma-separated-values-text',
  });
};
