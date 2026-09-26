import { utf8, zip } from './zip';
import {
  ExportInput, ExportSummary, CategoryRow,
  accountLabel, formatDay, monthLabel, periodLabel, sortedHuchaMovements, sortedMovements,
} from './data';

// Excel (.xlsx) escrito a mano: un zip con los XML del formato Office Open XML.
// Sin librerías: las que hay, o no escriben estilos, o necesitan módulos de
// Node que React Native no tiene. Los textos van como "inlineStr", que Excel,
// Numbers, Google Sheets y LibreOffice abren igual.

const INCOME_TEXT = '#15803D';
const EXPENSE_TEXT = '#B91C1C';
const MUTED = '#6B7280';
const INK = '#1F2937';

// Caracteres que XML no admite (controles), fuera; y los especiales, escapados
const xml = (value: string) =>
  value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`;

const column = (index: number) => {
  let n = index + 1;
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
};

/** Días desde el 30/12/1899: así guarda Excel las fechas. Solo el día, en hora local */
const excelDate = (d: Date) =>
  (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000;

// ── Estilos ─────────────────────────────────────────────────────────────

interface StyleDef {
  bold?: boolean;
  size?: number;
  color?: string;
  strike?: boolean;
  fill?: string;
  numFmt?: string;
  border?: 'top' | 'bottom';
  align?: 'left' | 'center' | 'right';
  indent?: number;
}

const BUILTIN_FORMATS: Record<string, number> = { '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4 };

class Styles {
  private fonts: string[] = [];
  private fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  private borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
  private formats: string[] = [];
  private xfs: string[] = [];
  private cache = new Map<string, number>();

  constructor() { this.get({}); }

  private static add(list: string[], item: string) {
    const i = list.indexOf(item);
    if (i >= 0) return i;
    list.push(item);
    return list.length - 1;
  }

  get(def: StyleDef): number {
    const key = JSON.stringify(def);
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;

    const fontId = Styles.add(this.fonts, `<font>${def.bold ? '<b/>' : ''}${def.strike ? '<strike/>' : ''}`
      + `<sz val="${def.size ?? 11}"/><color rgb="${argb(def.color ?? INK)}"/><name val="Calibri"/><family val="2"/></font>`);
    const fillId = def.fill
      ? Styles.add(this.fills, `<fill><patternFill patternType="solid"><fgColor rgb="${argb(def.fill)}"/><bgColor indexed="64"/></patternFill></fill>`)
      : 0;
    const borderId = !def.border ? 0 : Styles.add(this.borders, def.border === 'top'
      ? '<border><left/><right/><top style="thin"><color rgb="FF9CA3AF"/></top><bottom/><diagonal/></border>'
      : '<border><left/><right/><top/><bottom style="thin"><color rgb="FFE5E7EB"/></bottom><diagonal/></border>');
    const numFmtId = !def.numFmt ? 0 : BUILTIN_FORMATS[def.numFmt] ?? 164 + Styles.add(this.formats, def.numFmt);
    const align = `<alignment vertical="center"${def.align || def.indent ? ` horizontal="${def.align ?? 'left'}"` : ''}${def.indent ? ` indent="${def.indent}"` : ''}/>`;

    const id = this.xfs.length;
    this.xfs.push(`<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"`
      + ' applyFont="1" applyAlignment="1"'
      + `${numFmtId ? ' applyNumberFormat="1"' : ''}${fillId ? ' applyFill="1"' : ''}${borderId ? ' applyBorder="1"' : ''}>`
      + `${align}</xf>`);
    this.cache.set(key, id);
    return id;
  }

  toXml(): string {
    const formats = this.formats.length
      ? `<numFmts count="${this.formats.length}">${this.formats.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${xml(f)}"/>`).join('')}</numFmts>`
      : '';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + formats
      + `<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts>`
      + `<fills count="${this.fills.length}">${this.fills.join('')}</fills>`
      + `<borders count="${this.borders.length}">${this.borders.join('')}</borders>`
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>`
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
      + '</styleSheet>';
  }
}

// ── Hojas ───────────────────────────────────────────────────────────────

interface Cell { v: string | number | Date | null; s: number }
type Row = (Cell | null)[];

interface Sheet {
  name: string;
  widths: number[];
  rows: Row[];
  heights: Map<number, number>;
  /** Tabla con cabecera fija y filtros en la fila 1 */
  table?: { cols: number };
  gridLines?: boolean;
}

const cellXml = (cell: Cell, ref: string) => {
  const { v, s } = cell;
  if (v === null || v === '') return `<c r="${ref}" s="${s}"/>`;
  if (v instanceof Date) return `<c r="${ref}" s="${s}"><v>${excelDate(v)}</v></c>`;
  if (typeof v === 'number') return `<c r="${ref}" s="${s}"><v>${Number.isFinite(v) ? v : 0}</v></c>`;
  return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
};

const sheetXml = (sheet: Sheet, first: boolean) => {
  const rows = sheet.rows.map((row, r) => {
    const cells = row.map((cell, c) => (cell ? cellXml(cell, `${column(c)}${r + 1}`) : '')).join('');
    const ht = sheet.heights.get(r + 1);
    return `<row r="${r + 1}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${cells}</row>`;
  }).join('');
  const lastRow = Math.max(1, sheet.rows.length);
  const lastCol = column((sheet.table?.cols ?? sheet.widths.length) - 1);
  const pane = sheet.table
    ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>'
    : '';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>'
    + `<sheetViews><sheetView workbookViewId="0"${first ? ' tabSelected="1"' : ''}${sheet.gridLines === false ? ' showGridLines="0"' : ''}>${pane}</sheetView></sheetViews>`
    + '<sheetFormatPr defaultRowHeight="15"/>'
    + `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    + `<sheetData>${rows}</sheetData>`
    + (sheet.table ? `<autoFilter ref="A1:${lastCol}${lastRow}"/>` : '')
    + '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>'
    + '<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>'
    + '</worksheet>';
};

/** Nombre de hoja válido: sin []:*?/\, 31 caracteres como mucho y sin repetir */
const sheetNames = (names: string[]) => {
  const used = new Set<string>();
  return names.map((raw) => {
    const base = raw.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet';
    let name = base;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 28)} ${i}`;
    used.add(name.toLowerCase());
    return name;
  });
};

export const buildXlsx = (input: ExportInput, summary: ExportSummary): Uint8Array => {
  const { t } = input;
  const st = new Styles();
  const money = `#,##0.00\\ "${input.currencySymbol.replace(/"/g, '')}"`;
  const dateFmt = input.dateFormat === 'MM/DD/YYYY' ? 'mm/dd/yyyy' : 'dd/mm/yyyy';
  const S = {
    title: st.get({ bold: true, size: 18, color: input.accent }),
    sub: st.get({ size: 10, color: MUTED }),
    section: st.get({ bold: true, size: 13, color: input.accent }),
    head: st.get({ bold: true, color: '#FFFFFF', fill: input.accent }),
    headRight: st.get({ bold: true, color: '#FFFFFF', fill: input.accent, align: 'right' }),
    headCenter: st.get({ bold: true, color: '#FFFFFF', fill: input.accent, align: 'center' }),
    text: st.get({ border: 'bottom' }),
    textStrike: st.get({ border: 'bottom', strike: true, color: MUTED }),
    // Detrás de un importe (alineado a la derecha), con aire para no pegarse a él
    textAfterAmount: st.get({ border: 'bottom', indent: 1 }),
    textAfterAmountStrike: st.get({ border: 'bottom', indent: 1, strike: true, color: MUTED }),
    headAfterAmount: st.get({ bold: true, color: '#FFFFFF', fill: input.accent, indent: 1 }),
    center: st.get({ border: 'bottom', align: 'center' }),
    date: st.get({ border: 'bottom', numFmt: dateFmt, align: 'left' }),
    money: st.get({ border: 'bottom', numFmt: money }),
    moneyIn: st.get({ border: 'bottom', numFmt: money, color: INCOME_TEXT }),
    moneyOut: st.get({ border: 'bottom', numFmt: money, color: EXPENSE_TEXT }),
    int: st.get({ border: 'bottom', numFmt: '0', align: 'center' }),
    pct: st.get({ border: 'bottom', numFmt: '0.0%' }),
    label: st.get({}),
    labelBold: st.get({ bold: true }),
    kpiIn: st.get({ numFmt: money, color: INCOME_TEXT, bold: true }),
    kpiOut: st.get({ numFmt: money, color: EXPENSE_TEXT, bold: true }),
    kpi: st.get({ numFmt: money, bold: true }),
    kpiInt: st.get({ numFmt: '0', bold: true, align: 'right' }),
    totalLabel: st.get({ bold: true, border: 'top' }),
    totalMoney: st.get({ bold: true, border: 'top', numFmt: money }),
    totalPct: st.get({ bold: true, border: 'top', numFmt: '0.0%' }),
    totalInt: st.get({ bold: true, border: 'top', numFmt: '0', align: 'center' }),
    totalBlank: st.get({ border: 'top' }),
  };
  const c = (v: Cell['v'], s: number): Cell => ({ v, s });
  const signed = (type: 'income' | 'expense' | 'deposit' | 'withdrawal', amount: number) =>
    type === 'income' || type === 'deposit' ? c(amount, S.moneyIn) : c(-amount, S.moneyOut);
  const yesNo = (v: boolean) => c(v ? t('export.yes') : t('export.no'), S.center);
  const header = (labels: string[], right: number[] = [], center: number[] = [], indented: number[] = []) =>
    labels.map((l, i) => c(l, right.includes(i) ? S.headRight : center.includes(i) ? S.headCenter : indented.includes(i) ? S.headAfterAmount : S.head));

  // ── Resumen ──
  const summaryRows: Row[] = [];
  const heights = new Map<number, number>();
  const add = (row: Row = [], height?: number) => { summaryRows.push(row); if (height) heights.set(summaryRows.length, height); };
  const period = periodLabel(summary, input);
  add([c(`MoFlo · ${input.accountName}`, S.title)], 30);
  add([c([accountLabel(input), period, t('export.exportedOn', { date: formatDay(input.exportedAt, input.dateFormat) })].filter(Boolean).join(' · '), S.sub)]);
  add();
  add([null, c(t('export.totals'), S.section)], 22);
  add([null, c(t('home.income'), S.label), c(summary.income, S.kpiIn)]);
  add([null, c(t('home.expenses'), S.label), c(summary.expense, S.kpiOut)]);
  add([null, c(t('resumen.balance'), S.labelBold), c(summary.balance, S.kpi)]);
  if (input.huchas.length) add([null, c(t('export.savedInGoals'), S.label), c(summary.savedInGoals, S.kpi)]);
  add([null, c(t('export.movementsTitle'), S.label), c(summary.count, S.kpiInt)]);

  if (summary.months.length) {
    add();
    add([null, c(t('export.byMonth'), S.section)], 22);
    add([null, ...header([t('export.month'), t('home.income'), t('home.expenses'), t('resumen.balance')], [1, 2, 3])]);
    for (const m of summary.months) {
      add([null, c(monthLabel(m, input), S.text), c(m.income, S.moneyIn), c(m.expense, S.moneyOut), c(m.balance, S.money)]);
    }
    add([null, c(t('resumen.total'), S.totalLabel), c(summary.income, S.totalMoney), c(summary.expense, S.totalMoney), c(summary.balance, S.totalMoney)]);
  }

  const categoryTable = (title: string, list: CategoryRow[], total: number) => {
    if (!list.length) return;
    add();
    add([null, c(title, S.section)], 22);
    add([c(null, S.head), ...header([t('export.category'), t('export.amount'), '%'], [1, 2])]);
    for (const r of list) {
      add([c(null, st.get({ fill: r.color, border: 'bottom' })), c(r.name, r.deleted ? S.textStrike : S.text), c(r.amount, S.money), c(r.share, S.pct)]);
    }
    add([c(null, S.totalBlank), c(t('resumen.total'), S.totalLabel), c(total, S.totalMoney), c(total > 0 ? 1 : 0, S.totalPct)]);
  };
  categoryTable(t('export.expensesByCategory'), summary.expenseByCategory, summary.expense);
  categoryTable(t('export.incomeByCategory'), summary.incomeByCategory, summary.income);

  if (input.isShared && summary.members.length) {
    add();
    add([null, c(t('export.byMember'), S.section)], 22);
    add([null, ...header([t('export.member'), t('home.income'), t('home.expenses'), t('export.movementsTitle')], [1, 2], [3])]);
    for (const m of summary.members) {
      add([null, c(m.name, m.isFormer ? S.textStrike : S.text), c(m.income, S.moneyIn), c(m.expense, S.moneyOut), c(m.count, S.int)]);
    }
  }

  const sheets: Sheet[] = [{
    name: t('export.summaryTitle'), widths: [3, 34, 17, 17, 17], rows: summaryRows, heights, gridLines: false,
  }];

  // ── Movimientos ──
  const movCols = [
    t('export.date'), t('export.type'), t('export.category'), t('export.note'), t('export.amount'),
    ...(input.isShared ? [t('export.member')] : []), t('export.recurring'),
  ];
  sheets.push({
    name: t('export.movementsTitle'),
    widths: [12, 11, 24, 40, 16, ...(input.isShared ? [20] : []), 12],
    heights: new Map(),
    table: { cols: movCols.length },
    rows: [
      header(movCols, [4], [movCols.length - 1], input.isShared ? [5] : []),
      ...sortedMovements(input.movements).map((m) => {
        const cat = input.category(m.category, m.type);
        const who = input.isShared ? input.member(m.addedBy) : undefined;
        return [
          c(new Date(m.date), S.date),
          c(t(`movements.${m.type}`), S.text),
          c(cat.name, cat.deleted ? S.textStrike : S.text),
          c(m.note ?? '', S.text),
          signed(m.type, m.amount),
          ...(input.isShared ? [c(who?.name ?? '', who?.isFormer ? S.textAfterAmountStrike : S.textAfterAmount)] : []),
          yesNo(m.isRecurring),
        ];
      }),
    ],
  });

  // ── Recurrentes ──
  if (input.recurring.length) {
    const cols = [t('export.type'), t('export.category'), t('export.note'), t('export.amount'), t('export.recurringDay'), t('export.recurringActive')];
    sheets.push({
      name: t('export.recurringTitle'),
      widths: [11, 24, 40, 16, 8, 10],
      heights: new Map(),
      table: { cols: cols.length },
      rows: [
        header(cols, [3], [4, 5]),
        ...[...input.recurring].sort((a, b) => a.recurringDay - b.recurringDay).map((r) => {
          const cat = input.category(r.category, r.type);
          return [
            c(t(`movements.${r.type}`), S.text),
            c(cat.name, cat.deleted ? S.textStrike : S.text),
            c(r.note ?? r.description ?? '', S.text),
            signed(r.type, r.amount),
            c(r.recurringDay, S.int),
            yesNo(r.isActive),
          ];
        }),
      ],
    });
  }

  // ── Metas de ahorro ──
  if (input.huchas.length) {
    const cols = [
      t('export.huchaName'), t('export.huchaSaved'), t('export.huchaGoal'), t('export.huchaProgress'),
      t('export.huchaTargetDate'), t('export.huchaAutomatic'), t('export.huchaMonthly'), t('export.huchaDay'),
      t('export.huchaCreated'), t('export.huchaClosed'),
    ];
    const dash = c('—', S.center);
    sheets.push({
      name: t('export.huchasTitle'),
      widths: [26, 15, 15, 11, 14, 12, 18, 8, 12, 12],
      heights: new Map(),
      table: { cols: cols.length },
      rows: [
        header(cols, [1, 2, 3, 6], [4, 5, 7]),
        ...[...input.huchas]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .map((h) => [
            c(h.name, S.text),
            c(h.currentAmount, S.money),
            h.targetAmount > 0 ? c(h.targetAmount, S.money) : dash,
            h.targetAmount > 0 ? c(Math.min(1, h.currentAmount / h.targetAmount), S.pct) : dash,
            h.targetDate ? c(h.targetDate.split('-').reverse().join('/'), S.center) : dash,
            yesNo(h.isAutomatic),
            h.isAutomatic && h.monthlyAmount ? c(h.monthlyAmount, S.money) : dash,
            h.isAutomatic && h.recurringDay ? c(h.recurringDay, S.int) : dash,
            c(new Date(h.createdAt), S.date),
            h.closedAt ? c(new Date(h.closedAt), S.date) : dash,
          ]),
      ],
    });
  }

  // ── Movimientos de metas ──
  if (input.huchaMovements.length) {
    const cols = [t('export.date'), t('export.huchaMovGoal'), t('export.huchaMovType'), t('export.amount'), ...(input.isShared ? [t('export.member')] : [])];
    sheets.push({
      name: t('export.huchaMovementsTitle'),
      widths: [12, 26, 14, 16, ...(input.isShared ? [20] : [])],
      heights: new Map(),
      table: { cols: cols.length },
      rows: [
        header(cols, [3], [], input.isShared ? [4] : []),
        ...sortedHuchaMovements(input.huchaMovements).map((hm) => {
          const who = input.isShared ? input.member(hm.addedBy) : undefined;
          return [
            c(new Date(hm.date), S.date),
            c(hm.huchaName, S.text),
            c(hm.type === 'deposit' ? t('export.deposit') : t('export.withdrawal'), S.text),
            signed(hm.type, hm.amount),
            ...(input.isShared ? [c(who?.name ?? '', who?.isFormer ? S.textAfterAmountStrike : S.textAfterAmount)] : []),
          ];
        }),
      ],
    });
  }

  // ── Libro ──
  const names = sheetNames(sheets.map((s) => s.name));
  const filters = sheets
    .map((s, i) => (s.table
      ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xml(names[i].replace(/'/g, "''"))}'!$A$1:$${column(s.table.cols - 1)}$${Math.max(1, s.rows.length)}</definedName>`
      : ''))
    .join('');
  const files: Record<string, string> = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
      + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
      + '</Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
      + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
      + '</Relationships>',
    'docProps/core.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
      + `<dc:title>${xml(`MoFlo · ${input.accountName}`)}</dc:title><dc:creator>MoFlo</dc:creator>`
      + `<dcterms:created xsi:type="dcterms:W3CDTF">${input.exportedAt.toISOString().replace(/\.\d{3}Z$/, 'Z')}</dcterms:created>`
      + '</cp:coreProperties>',
    'docProps/app.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>MoFlo</Application></Properties>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<bookViews><workbookView activeTab="0"/></bookViews>'
      + `<sheets>${names.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>`
      + (filters ? `<definedNames>${filters}</definedNames>` : '')
      + '</workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
      + '</Relationships>',
  };
  // Las hojas primero: al generarlas se registran los estilos que usan
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s, i === 0); });
  files['xl/styles.xml'] = st.toXml();

  return zip(Object.entries(files).map(([name, content]) => ({ name, data: utf8(content) })), input.exportedAt);
};
