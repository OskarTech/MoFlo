import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Movement, Hucha, RecurringMovement, HuchaMovement } from '../types';
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
  recurringMovements: RecurringMovement[],
  huchaMovements: HuchaMovement[],
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

  // ── RECURRING MOVEMENTS ────────────────────────────────────────
  const recurringHeaders = [
    t('export.type'),
    t('export.category'),
    t('export.note'),
    t('export.amount'),
    t('export.currency'),
    t('export.recurringDay'),
    t('export.recurringActive'),
  ].join(',');

  const recurringRows = [...recurringMovements]
    .sort((a, b) => a.recurringDay - b.recurringDay)
    .map((r) => {
      const type = t(`movements.${r.type}`);
      const category = getCategoryName(r.category, r.type, t);
      const amount = r.type === 'income'
        ? `+${r.amount.toFixed(2)}`
        : `-${r.amount.toFixed(2)}`;
      const currency = r.currency ?? 'EUR';
      const day = String(r.recurringDay);
      const active = r.isActive ? t('export.yes') : t('export.no');
      const note = r.note ?? r.description ?? '';

      return [
        escapeCSV(type),
        escapeCSV(category),
        escapeCSV(note),
        escapeCSV(amount),
        escapeCSV(currency),
        escapeCSV(day),
        escapeCSV(active),
      ].join(',');
    });

  // ── HUCHAS ─────────────────────────────────────────────────────
  const huchaHeaders = [
    t('export.huchaName'),
    t('export.huchaIcon'),
    t('export.huchaSaved'),
    t('export.huchaGoal'),
    t('export.huchaProgress'),
    t('export.huchaTargetDate'),
    t('export.huchaAutomatic'),
    t('export.huchaMonthly'),
    t('export.huchaDay'),
    t('export.huchaCreated'),
    t('export.huchaClosed'),
  ].join(',');

  const huchaRows = [...huchas]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((h) => {
      const progress = h.targetAmount > 0
        ? `${Math.min(100, Math.round((h.currentAmount / h.targetAmount) * 100))}%`
        : '—';
      const targetDate = h.targetDate
        ? (() => { const [y, mo] = h.targetDate!.split('-'); return `${mo}/${y}`; })()
        : '—';
      const automatic = h.isAutomatic ? t('export.yes') : t('export.no');
      const monthly = h.isAutomatic && h.monthlyAmount ? h.monthlyAmount.toFixed(2) : '—';
      const day = h.isAutomatic && h.recurringDay ? String(h.recurringDay) : '—';
      const created = new Date(h.createdAt).toLocaleDateString();
      const closed = h.closedAt ? new Date(h.closedAt).toLocaleDateString() : '—';

      return [
        escapeCSV(h.name),
        escapeCSV(h.icon),
        escapeCSV(h.currentAmount.toFixed(2)),
        escapeCSV(h.targetAmount > 0 ? h.targetAmount.toFixed(2) : '—'),
        escapeCSV(progress),
        escapeCSV(targetDate),
        escapeCSV(automatic),
        escapeCSV(monthly),
        escapeCSV(day),
        escapeCSV(created),
        escapeCSV(closed),
      ].join(',');
    });

  // ── HUCHA MOVEMENTS ────────────────────────────────────────────
  const huchaMovHeaders = [
    ...(includeUser ? [t('export.user')] : []),
    t('export.date'),
    t('export.huchaMovGoal'),
    t('export.huchaMovType'),
    t('export.amount'),
  ].join(',');

  const huchaMovRows = [...huchaMovements]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map((hm) => {
      const date = new Date(hm.date).toLocaleDateString();
      const type = hm.type === 'deposit' ? t('export.deposit') : t('export.withdrawal');
      const amount = hm.type === 'deposit'
        ? `+${hm.amount.toFixed(2)}`
        : `-${hm.amount.toFixed(2)}`;
      const user = includeUser ? (hm.addedBy ? memberNames![hm.addedBy] ?? '' : '') : null;

      return [
        ...(includeUser ? [escapeCSV(user!)] : []),
        escapeCSV(date),
        escapeCSV(hm.huchaName),
        escapeCSV(type),
        escapeCSV(amount),
      ].join(',');
    });

  // ── COMBINE ────────────────────────────────────────────────────
  const lines: string[] = [movHeaders, ...movRows];

  if (recurringMovements.length > 0) {
    lines.push('');
    lines.push(escapeCSV(t('export.recurringTitle')));
    lines.push(recurringHeaders);
    lines.push(...recurringRows);
  }

  if (huchas.length > 0) {
    lines.push('');
    lines.push(escapeCSV(t('export.huchasTitle')));
    lines.push(huchaHeaders);
    lines.push(...huchaRows);
  }

  if (huchaMovements.length > 0) {
    lines.push('');
    lines.push(escapeCSV(t('export.huchaMovementsTitle')));
    lines.push(huchaMovHeaders);
    lines.push(...huchaMovRows);
  }

  const csv = lines.join('\n');
  const fileName = `moflo_export_${new Date().toISOString().split('T')[0]}.csv`;

  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(csv);

  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    dialogTitle: 'MoFlo — Export CSV',
    UTI: 'public.comma-separated-values-text',
  });
};
