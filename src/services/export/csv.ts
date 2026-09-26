import { ExportInput, formatDay, sortedMovements } from './data';

// CSV: los movimientos en una sola tabla, para abrirlos en una hoja de cálculo
// o importarlos en otra app. El resumen, los recurrentes y las metas van en el
// Excel y el PDF: un CSV solo admite una tabla, y antes se apilaban cuatro con
// columnas distintas.

/**
 * Separador de columnas según el decimal del idioma. Excel en español, alemán,
 * francés... usa la coma como decimal y espera punto y coma entre columnas:
 * con comas lo metía todo en la columna A.
 */
export const csvDelimiter = (input: ExportInput) => (input.separators.decimal === ',' ? ';' : ',');

const quote = (value: string, delimiter: string) =>
  value.includes(delimiter) || value.includes('"') || value.includes('\n') || value.includes('\r')
    ? `"${value.replace(/"/g, '""')}"`
    : value;

/**
 * Texto escrito por una persona (notas, categorías, nombres): Excel y
 * LibreOffice ejecutan como fórmula lo que empieza por =, +, - o @, y en una
 * cuenta compartida esa nota la puede escribir otro miembro. Un apóstrofo
 * delante la deja como texto. Los importes no pasan por aquí.
 */
const text = (value: string, delimiter: string) =>
  quote(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value, delimiter);

/** Importe como número: sin signo +, sin miles y con el decimal del idioma */
const amount = (n: number, input: ExportInput) => n.toFixed(2).replace('.', input.separators.decimal);

export const buildCsv = (input: ExportInput): string => {
  const d = csvDelimiter(input);
  const { t } = input;
  const header = [
    ...(input.isShared ? [t('export.user')] : []),
    t('export.date'), t('export.type'), t('export.category'), t('export.note'),
    t('export.amount'), t('export.currency'), t('export.recurring'),
  ].map((h) => quote(h, d));

  const rows = sortedMovements(input.movements).map((m) => {
    const signed = m.type === 'income' ? m.amount : -m.amount;
    return [
      ...(input.isShared ? [text(input.member(m.addedBy)?.name ?? '', d)] : []),
      quote(formatDay(new Date(m.date), input.dateFormat), d),
      quote(t(`movements.${m.type}`), d),
      text(input.category(m.category, m.type).name, d),
      text(m.note ?? '', d),
      quote(amount(signed, input), d),
      quote(m.currency || input.currencySymbol, d),
      quote(m.isRecurring ? t('export.yes') : t('export.no'), d),
    ];
  });

  // Marca de orden de bytes: sin ella Excel abre el fichero como ANSI y
  // destroza los acentos y la ñ
  return '﻿' + [header, ...rows].map((r) => r.join(d)).join('\r\n');
};
