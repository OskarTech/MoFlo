import type { Hucha, HuchaMovement, Movement, MovementType, RecurringMovement } from '../../types';

// Todo lo que necesitan las tres exportaciones (CSV, Excel y PDF), ya resuelto
// para la cuenta activa: aquí no se lee ningún store, así se puede probar.

export type ExportDateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY';

export interface ExportCategory {
  name: string;
  /** Color de gasto de la categoría (los de ingreso van por puesto: incomeColor) */
  color: string;
  /** Borrada, o predeterminada eliminada: en la app sale tachada */
  deleted: boolean;
}

export interface ExportMember {
  name: string;
  /** Ya no está en la cuenta: en la app sale tachado */
  isFormer: boolean;
}

export interface ExportInput {
  accountName: string;
  isShared: boolean;
  memberCount: number;
  currencySymbol: string;
  dateFormat: ExportDateFormat;
  separators: { thousands: string; decimal: string };
  exportedAt: Date;
  /** Color principal de la paleta activa */
  accent: string;
  movements: Movement[];
  recurring: RecurringMovement[];
  huchas: Hucha[];
  huchaMovements: HuchaMovement[];
  category: (id: string, type: MovementType) => ExportCategory;
  incomeColor: (rank: number) => string;
  /** Solo en cuenta compartida: quién añadió cada cosa */
  member: (uid: string | undefined) => ExportMember | undefined;
  t: (key: string, options?: Record<string, unknown>) => string;
}

export interface MonthRow {
  year: number;
  month: number; // 0-11
  income: number;
  expense: number;
  balance: number;
  count: number;
}

export interface CategoryRow extends ExportCategory {
  id: string;
  type: MovementType;
  amount: number;
  /** Parte del total de su tipo, de 0 a 1 */
  share: number;
  count: number;
}

export interface MemberRow extends ExportMember {
  /** Los movimientos recurrentes van juntos, como en la app */
  isRecurring: boolean;
  income: number;
  expense: number;
  count: number;
}

export interface ExportSummary {
  income: number;
  expense: number;
  balance: number;
  count: number;
  savedInGoals: number;
  activeGoals: number;
  /** Del más reciente al más antiguo */
  months: MonthRow[];
  expenseByCategory: CategoryRow[];
  incomeByCategory: CategoryRow[];
  members: MemberRow[];
}

const cents = (n: number) => Math.round(n * 100) / 100;
const byDateDesc = (a: { date: string }, b: { date: string }) =>
  new Date(b.date).getTime() - new Date(a.date).getTime();

export const sortedMovements = (movements: Movement[]) => [...movements].sort(byDateDesc);
export const sortedHuchaMovements = (list: HuchaMovement[]) => [...list].sort(byDateDesc);

function byCategory(input: ExportInput, type: MovementType, total: number): CategoryRow[] {
  const acc = new Map<string, { amount: number; count: number }>();
  for (const m of input.movements) {
    if (m.type !== type) continue;
    const row = acc.get(m.category) ?? { amount: 0, count: 0 };
    row.amount += m.amount;
    row.count++;
    acc.set(m.category, row);
  }
  return [...acc.entries()]
    .map(([id, { amount, count }]) => ({ id, type, amount: cents(amount), count, ...input.category(id, type) }))
    .sort((a, b) => b.amount - a.amount)
    .map((row, rank) => ({
      ...row,
      share: total > 0 ? row.amount / total : 0,
      // Los ingresos se colorean por puesto, igual que en la app
      color: type === 'income' ? input.incomeColor(rank) : row.color,
    }));
}

export const summarize = (input: ExportInput): ExportSummary => {
  let income = 0;
  let expense = 0;
  const months = new Map<string, MonthRow>();
  const members = new Map<string, MemberRow>();
  const recurringLabel = input.t('export.recurringTitle');

  for (const m of input.movements) {
    if (m.type === 'income') income += m.amount; else expense += m.amount;

    const d = new Date(m.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const row = months.get(key) ?? { year: d.getFullYear(), month: d.getMonth(), income: 0, expense: 0, balance: 0, count: 0 };
    if (m.type === 'income') row.income += m.amount; else row.expense += m.amount;
    row.count++;
    months.set(key, row);

    if (input.isShared) {
      // Los recurrentes los genera la app, no un miembro: van en su propio grupo
      const who = m.isRecurring ? undefined : input.member(m.addedBy);
      const mkey = m.isRecurring ? '__recurring' : m.addedBy ?? '__unknown';
      const mrow = members.get(mkey) ?? {
        name: m.isRecurring ? recurringLabel : who?.name ?? input.t('common.user'),
        isFormer: who?.isFormer ?? false,
        isRecurring: m.isRecurring,
        income: 0, expense: 0, count: 0,
      };
      if (m.type === 'income') mrow.income += m.amount; else mrow.expense += m.amount;
      mrow.count++;
      members.set(mkey, mrow);
    }
  }

  const active = input.huchas.filter((h) => !h.closedAt);
  return {
    income: cents(income),
    expense: cents(expense),
    balance: cents(income - expense),
    count: input.movements.length,
    savedInGoals: cents(active.reduce((s, h) => s + h.currentAmount, 0)),
    activeGoals: active.length,
    months: [...months.values()]
      .map((r) => ({ ...r, income: cents(r.income), expense: cents(r.expense), balance: cents(r.income - r.expense) }))
      .sort((a, b) => b.year - a.year || b.month - a.month),
    expenseByCategory: byCategory(input, 'expense', expense),
    incomeByCategory: byCategory(input, 'income', income),
    members: [...members.values()]
      .map((r) => ({ ...r, income: cents(r.income), expense: cents(r.expense) }))
      // Los miembros por lo que han movido; los recurrentes, al final
      .sort((a, b) => Number(a.isRecurring) - Number(b.isRecurring) || (b.income + b.expense) - (a.income + a.expense)),
  };
};

// ── Formato ─────────────────────────────────────────────────────────────

/** Importe con los separadores del idioma, como en la app */
export const formatNumber = (n: number, input: ExportInput, decimals = 2): string => {
  const [int, dec] = Math.abs(n).toFixed(decimals).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, input.separators.thousands);
  return `${n < 0 ? '-' : ''}${grouped}${dec ? input.separators.decimal + dec : ''}`;
};

/** Importe con el símbolo detrás, como en la app */
export const formatMoney = (n: number, input: ExportInput): string =>
  `${formatNumber(n, input)} ${input.currencySymbol}`;

export const formatDay = (date: Date, format: ExportDateFormat): string => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return format === 'MM/DD/YYYY' ? `${month}/${day}/${date.getFullYear()}` : `${day}/${month}/${date.getFullYear()}`;
};

export const monthLabel = (row: { year: number; month: number }, input: ExportInput): string =>
  `${input.t(`home.month_${row.month}`)} ${row.year}`;

/** "Enero 2025 – Septiembre 2026", o un solo mes; vacío sin movimientos */
export const periodLabel = (summary: ExportSummary, input: ExportInput): string => {
  if (!summary.months.length) return '';
  const last = summary.months[0];
  const first = summary.months[summary.months.length - 1];
  return first === last ? monthLabel(first, input) : `${monthLabel(first, input)} – ${monthLabel(last, input)}`;
};

/** "Cuenta compartida · 3 miembros" o "Cuenta individual" */
export const accountLabel = (input: ExportInput): string =>
  input.isShared
    ? `${input.t('export.sharedAccountLabel')} · ${input.t('export.memberCount', { count: input.memberCount })}`
    : input.t('export.personalAccountLabel');

/** Nombre de fichero: sin caracteres que algún sistema no admita */
export const fileBaseName = (input: ExportInput): string => {
  const d = input.exportedAt;
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const account = input.isShared
    ? input.accountName.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
    : '';
  return account ? `MoFlo_${account}_${stamp}` : `MoFlo_${stamp}`;
};
