import {
  ExportInput, ExportSummary, CategoryRow, MonthRow,
  accountLabel, formatDay, formatMoney, monthLabel, periodLabel, sortedHuchaMovements, sortedMovements,
} from './data';

// Informe PDF: HTML que el sistema imprime a PDF (expo-print). Imita lo que se
// ve en la app: totales, meses, gastos por categoría con su color y los
// movimientos agrupados por mes. Solo CSS sencillo y SVG, que se imprimen
// igual en iOS (WebKit) y en Android (WebView de Chromium).

const INCOME_TEXT = '#15803D';
const EXPENSE_TEXT = '#B91C1C';
const INCOME_BAR = '#22A35A';
const EXPENSE_BAR = '#E0524A';

const esc = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const struck = (text: string, isStruck: boolean) => (isStruck ? `<s>${esc(text)}</s>` : esc(text));

function donut(rows: CategoryRow[], total: number): string {
  if (!rows.length || total <= 0) return '';
  const size = 120, r1 = 58, r0 = 38, cx = 60, cy = 60;
  if (rows.length === 1) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${cx}" cy="${cy}" r="${(r0 + r1) / 2}" fill="none" stroke="${rows[0].color}" stroke-width="${r1 - r0}"/></svg>`;
  }
  let a = -Math.PI / 2;
  const pt = (r: number, ang: number) => `${(cx + r * Math.cos(ang)).toFixed(2)} ${(cy + r * Math.sin(ang)).toFixed(2)}`;
  const paths = rows.map((row) => {
    const a1 = a + (row.amount / total) * Math.PI * 2;
    const large = a1 - a > Math.PI ? 1 : 0;
    const d = `M${pt(r1, a)}A${r1} ${r1} 0 ${large} 1 ${pt(r1, a1)}L${pt(r0, a1)}A${r0} ${r0} 0 ${large} 0 ${pt(r0, a)}Z`;
    a = a1;
    return `<path d="${d}" fill="${row.color}" stroke="#FFFFFF" stroke-width="1.5"/>`;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${paths}</svg>`;
}

/** Barras de ingresos y gastos de los últimos 12 meses con datos, de antiguo a reciente */
function monthChart(months: MonthRow[], input: ExportInput): string {
  const list = months.slice(0, 12).reverse();
  if (list.length < 2) return '';
  const max = Math.max(...list.map((m) => Math.max(m.income, m.expense)), 1);
  const w = 520, h = 150, base = 124, top = 10, slot = w / list.length, bw = Math.min(14, slot / 3.2);
  const bars = list.map((m, i) => {
    const x = i * slot + slot / 2;
    const hi = ((base - top) * m.income) / max;
    const he = ((base - top) * m.expense) / max;
    const label = input.t(`home.month_${m.month}`).slice(0, 3);
    return `<rect x="${(x - bw - 1).toFixed(1)}" y="${(base - hi).toFixed(1)}" width="${bw.toFixed(1)}" height="${hi.toFixed(1)}" rx="2" fill="${INCOME_BAR}"/>`
      + `<rect x="${(x + 1).toFixed(1)}" y="${(base - he).toFixed(1)}" width="${bw.toFixed(1)}" height="${he.toFixed(1)}" rx="2" fill="${EXPENSE_BAR}"/>`
      + `<text x="${x.toFixed(1)}" y="${base + 16}" text-anchor="middle">${esc(label)}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="xMidYMid meet">`
    + `<line x1="0" y1="${base}" x2="${w}" y2="${base}" stroke="#D1D5DB" stroke-width="1"/>${bars}</svg>`
    + `<div class="legend-inline"><span><i style="background:${INCOME_BAR}"></i>${esc(input.t('home.income'))}</span>`
    + `<span><i style="background:${EXPENSE_BAR}"></i>${esc(input.t('home.expenses'))}</span></div>`;
}

const categoryBlock = (title: string, rows: CategoryRow[], total: number, input: ExportInput) => {
  if (!rows.length) return '';
  const items = rows.map((r) => `<tr><td class="dot-cell"><i class="dot" style="background:${r.color}"></i></td>`
    + `<td>${struck(r.name, r.deleted)}</td><td class="num">${esc(formatMoney(r.amount, input))}</td>`
    + `<td class="num muted">${esc((r.share * 100).toFixed(1).replace('.', input.separators.decimal))} %</td></tr>`).join('');
  return `<div class="cat-block"><h2>${esc(title)}</h2><div class="cat-body"><div class="donut">${donut(rows, total)}</div>`
    + `<table class="cat-table">${items}</table></div></div>`;
};

export interface ReportOptions {
  /** Márgenes de página en CSS. En iOS van a 0: allí los pone expo-print */
  pageMargin: string;
}

export const buildReportHtml = (input: ExportInput, summary: ExportSummary, options: ReportOptions): string => {
  const { t } = input;
  const money = (n: number) => esc(formatMoney(n, input));
  const signedMoney = (income: boolean, n: number) =>
    `<span style="color:${income ? INCOME_TEXT : EXPENSE_TEXT}">${income ? '+' : '-'}${money(n)}</span>`;
  const day = (iso: string) => esc(formatDay(new Date(iso), input.dateFormat));
  const period = periodLabel(summary, input);

  const kpis = [
    [t('home.income'), money(summary.income), INCOME_TEXT],
    [t('home.expenses'), money(summary.expense), EXPENSE_TEXT],
    [t('resumen.balance'), money(summary.balance), '#111827'],
    ...(input.huchas.length ? [[t('export.savedInGoals'), money(summary.savedInGoals), input.accent]] : []),
  ].map(([label, value, color]) => `<div class="kpi"><span>${esc(label)}</span><b style="color:${color}">${value}</b></div>`).join('');

  const monthsTable = summary.months.length
    ? `<section><h2>${esc(t('export.byMonth'))}</h2>${monthChart(summary.months, input)}`
      + `<table class="grid"><thead><tr><th>${esc(t('export.month'))}</th><th class="num">${esc(t('home.income'))}</th>`
      + `<th class="num">${esc(t('home.expenses'))}</th><th class="num">${esc(t('resumen.balance'))}</th></tr></thead><tbody>`
      + summary.months.map((m) => `<tr><td>${esc(monthLabel(m, input))}</td><td class="num" style="color:${INCOME_TEXT}">${money(m.income)}</td>`
        + `<td class="num" style="color:${EXPENSE_TEXT}">${money(m.expense)}</td><td class="num"><b>${money(m.balance)}</b></td></tr>`).join('')
      + '</tbody></table></section>'
    : '';

  const categories = (summary.expenseByCategory.length || summary.incomeByCategory.length)
    ? `<section class="cats">${categoryBlock(t('export.expensesByCategory'), summary.expenseByCategory, summary.expense, input)}`
      + `${categoryBlock(t('export.incomeByCategory'), summary.incomeByCategory, summary.income, input)}</section>`
    : '';

  const members = input.isShared && summary.members.length
    ? `<section><h2>${esc(t('export.byMember'))}</h2><table class="grid"><thead><tr><th>${esc(t('export.member'))}</th>`
      + `<th class="num">${esc(t('home.income'))}</th><th class="num">${esc(t('home.expenses'))}</th><th class="num">${esc(t('export.movementsTitle'))}</th></tr></thead><tbody>`
      + summary.members.map((m) => `<tr><td>${struck(m.name, m.isFormer)}</td><td class="num" style="color:${INCOME_TEXT}">${money(m.income)}</td>`
        + `<td class="num" style="color:${EXPENSE_TEXT}">${money(m.expense)}</td><td class="num">${m.count}</td></tr>`).join('')
      + '</tbody></table></section>'
    : '';

  // Movimientos agrupados por mes, del más reciente al más antiguo, como en el historial.
  // Los ingresos llevan el color de su categoría en el resumen (van por puesto)
  const incomeColors = new Map(summary.incomeByCategory.map((r) => [r.id, r.color]));
  const groups = new Map<string, typeof input.movements>();
  for (const m of sortedMovements(input.movements)) {
    const d = new Date(m.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  const movements = input.movements.length
    ? `<section class="break"><h2>${esc(t('export.movementsTitle'))}</h2>`
      + summary.months.map((mr) => {
        const list = groups.get(`${mr.year}-${mr.month}`) ?? [];
        const rows = list.map((m) => {
          const cat = input.category(m.category, m.type);
          const who = input.isShared && !m.isRecurring ? input.member(m.addedBy) : undefined;
          const color = m.type === 'income' ? incomeColors.get(m.category) ?? input.incomeColor(0) : cat.color;
          return `<tr><td class="date">${day(m.date)}</td>`
            + `<td><i class="dot" style="background:${color}"></i><span class="mov-cat">${struck(cat.name, cat.deleted)}</span>`
            + `${m.note ? `<span class="note"> · ${esc(m.note)}</span>` : ''}`
            + `${m.isRecurring ? ` <span class="badge">${esc(t('export.recurring'))}</span>` : ''}</td>`
            + (input.isShared ? `<td class="who">${who ? struck(who.name, who.isFormer) : ''}</td>` : '')
            + `<td class="num amount">${signedMoney(m.type === 'income', m.amount)}</td></tr>`;
        }).join('');
        return `<div class="month"><div class="month-head"><b>${esc(monthLabel(mr, input))}</b>`
          + `<span><span style="color:${INCOME_TEXT}">+${money(mr.income)}</span> · <span style="color:${EXPENSE_TEXT}">-${money(mr.expense)}</span></span></div>`
          + `<table class="grid movs"><tbody>${rows}</tbody></table></div>`;
      }).join('')
      + '</section>'
    : `<section><p class="empty">${esc(t('export.noMovements'))}</p></section>`;

  const recurring = input.recurring.length
    ? `<section><h2>${esc(t('export.recurringTitle'))}</h2><table class="grid"><thead><tr><th>${esc(t('export.recurringDay'))}</th>`
      + `<th>${esc(t('export.category'))}</th><th>${esc(t('export.note'))}</th><th class="num">${esc(t('export.amount'))}</th><th>${esc(t('export.recurringActive'))}</th></tr></thead><tbody>`
      + [...input.recurring].sort((a, b) => a.recurringDay - b.recurringDay).map((r) => {
        const cat = input.category(r.category, r.type);
        return `<tr${r.isActive ? '' : ' class="inactive"'}><td>${r.recurringDay}</td><td>${struck(cat.name, cat.deleted)}</td>`
          + `<td>${esc(r.note ?? '')}</td><td class="num">${signedMoney(r.type === 'income', r.amount)}</td>`
          + `<td>${esc(r.isActive ? t('export.yes') : t('export.no'))}</td></tr>`;
      }).join('')
      + '</tbody></table></section>'
    : '';

  const huchas = input.huchas.length
    ? `<section><h2>${esc(t('export.huchasTitle'))}</h2><div class="goals">`
      + [...input.huchas].sort((a, b) => Number(!!a.closedAt) - Number(!!b.closedAt) || b.currentAmount - a.currentAmount).map((h) => {
        const pct = h.targetAmount > 0 ? Math.min(100, Math.round((h.currentAmount / h.targetAmount) * 100)) : null;
        const detail = [
          h.targetAmount > 0 ? `${money(h.currentAmount)} / ${money(h.targetAmount)}` : money(h.currentAmount),
          h.targetDate ? esc(h.targetDate.split('-').reverse().join('/')) : '',
          h.isAutomatic && h.monthlyAmount ? `${esc(t('export.huchaMonthly'))}: ${money(h.monthlyAmount)}` : '',
          h.closedAt ? `${esc(t('export.huchaClosed'))}: ${day(h.closedAt)}` : '',
        ].filter(Boolean).join(' · ');
        return `<div class="goal${h.closedAt ? ' inactive' : ''}"><div class="goal-head"><b>${esc(h.name)}</b>${pct !== null ? `<span>${pct} %</span>` : ''}</div>`
          + (pct !== null ? `<div class="bar"><i style="width:${pct}%;background:${input.accent}"></i></div>` : '')
          + `<div class="muted small">${detail}</div></div>`;
      }).join('')
      + '</div></section>'
    : '';

  const huchaMovs = input.huchaMovements.length
    ? `<section><h2>${esc(t('export.huchaMovementsTitle'))}</h2><table class="grid"><thead><tr><th>${esc(t('export.date'))}</th>`
      + `<th>${esc(t('export.huchaMovGoal'))}</th><th>${esc(t('export.huchaMovType'))}</th>${input.isShared ? `<th>${esc(t('export.member'))}</th>` : ''}`
      + `<th class="num">${esc(t('export.amount'))}</th></tr></thead><tbody>`
      + sortedHuchaMovements(input.huchaMovements).map((hm) => {
        const who = input.isShared ? input.member(hm.addedBy) : undefined;
        return `<tr><td class="date">${day(hm.date)}</td><td>${esc(hm.huchaName)}</td>`
          + `<td>${esc(hm.type === 'deposit' ? t('export.deposit') : t('export.withdrawal'))}</td>`
          + `${input.isShared ? `<td>${who ? struck(who.name, who.isFormer) : ''}</td>` : ''}`
          + `<td class="num">${signedMoney(hm.type === 'deposit', hm.amount)}</td></tr>`;
      }).join('')
      + '</tbody></table></section>'
    : '';

  const exported = t('export.exportedOn', { date: formatDay(input.exportedAt, input.dateFormat) });

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
@page { size: A4; margin: ${options.pageMargin}; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; }
body { font-family: -apple-system, "Helvetica Neue", Roboto, "Segoe UI", Arial, sans-serif; color: #1F2937; font-size: 10.5pt; line-height: 1.4; }
h1, h2 { margin: 0; font-weight: 700; }
h2 { font-size: 13pt; color: ${input.accent}; margin: 0 0 8px; break-after: avoid; page-break-after: avoid; }
section { margin-top: 20px; }
.break { break-before: page; page-break-before: always; margin-top: 0; }
.hero { background: ${input.accent}; color: #FFFFFF; border-radius: 12px; padding: 18px 20px; }
.brand { font-size: 9pt; letter-spacing: .14em; text-transform: uppercase; opacity: .85; }
.hero h1 { font-size: 22pt; margin: 4px 0 6px; line-height: 1.15; }
.hero p { margin: 0; font-size: 10pt; opacity: .92; }
.kpis { display: flex; gap: 10px; margin-top: 14px; }
.kpi { flex: 1; border: 1px solid #E5E7EB; border-radius: 10px; padding: 10px 12px; }
.kpi span { display: block; font-size: 8.5pt; color: #6B7280; text-transform: uppercase; letter-spacing: .06em; }
.kpi b { display: block; font-size: 13.5pt; margin-top: 2px; white-space: nowrap; }
.chart { display: block; margin: 4px 0 2px; }
.chart text { font-size: 10px; fill: #6B7280; }
.legend-inline { display: flex; gap: 14px; font-size: 8.5pt; color: #6B7280; margin-bottom: 8px; }
.legend-inline i { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
table { width: 100%; border-collapse: collapse; }
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
.grid th { text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .05em; color: #6B7280; font-weight: 600; padding: 6px 8px; border-bottom: 1.5px solid #D1D5DB; }
.grid td { padding: 6px 8px; border-bottom: 1px solid #EEF0F2; vertical-align: top; }
.num, .grid th.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.muted { color: #6B7280; }
.small { font-size: 9pt; }
s { color: #6B7280; }
.cats { display: flex; gap: 24px; break-inside: avoid; page-break-inside: avoid; }
.cat-block { flex: 1; min-width: 0; }
.cat-body { display: flex; gap: 12px; align-items: flex-start; }
.donut { flex: 0 0 auto; }
.cat-table td { padding: 3px 4px; font-size: 9.5pt; border-bottom: 1px solid #F1F3F5; }
.dot-cell { width: 14px; }
.dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; }
.month { margin-bottom: 14px; }
.month-head { display: flex; justify-content: space-between; align-items: baseline; background: #F5F6F8; border-radius: 8px; padding: 7px 10px; margin-bottom: 2px; break-after: avoid; page-break-after: avoid; }
.month-head span { font-size: 9.5pt; }
/* Anchos fijos: cada mes es una tabla y así las columnas cuadran de un mes a otro */
.movs { table-layout: fixed; }
.movs td { padding: 5px 8px; font-size: 9.5pt; overflow-wrap: anywhere; }
.movs td.amount { width: 112px; }
.movs td.date { width: 74px; color: #6B7280; white-space: nowrap; }
.movs td.who { width: 22%; color: #6B7280; }
.movs .dot { margin-right: 6px; }
.mov-cat { font-weight: 600; }
.note { color: #4B5563; }
.badge { display: inline-block; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .05em; color: ${input.accent}; border: 1px solid ${input.accent}; border-radius: 4px; padding: 0 4px; }
.amount { font-weight: 600; }
.inactive { opacity: .55; }
.goals { display: flex; flex-wrap: wrap; gap: 10px; }
.goal { width: calc(50% - 5px); border: 1px solid #E5E7EB; border-radius: 10px; padding: 10px 12px; break-inside: avoid; page-break-inside: avoid; }
.goal-head { display: flex; justify-content: space-between; gap: 8px; }
.bar { height: 6px; background: #EEF0F2; border-radius: 3px; overflow: hidden; margin: 6px 0; }
.bar i { display: block; height: 100%; border-radius: 3px; }
.empty { color: #6B7280; }
footer { margin-top: 24px; font-size: 8.5pt; color: #9CA3AF; text-align: center; }
</style></head><body>
<header class="hero"><div class="brand">MoFlo</div><h1>${esc(input.accountName)}</h1>
<p>${esc([accountLabel(input), period].filter(Boolean).join(' · '))}</p><p>${esc(exported)}</p></header>
<div class="kpis">${kpis}</div>
${monthsTable}${categories}${members}${movements}${recurring}${huchas}${huchaMovs}
<footer>${esc(t('export.generatedWith'))} · ${esc(exported)}</footer>
</body></html>`;
};
