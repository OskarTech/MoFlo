import { crc32, utf8, zip } from '../zip';
import { ExportInput, fileBaseName, formatMoney, summarize } from '../data';
import { buildCsv } from '../csv';
import { buildXlsx } from '../xlsx';
import { buildReportHtml } from '../pdf';
import type { Movement } from '../../../types';

const mov = (id: string, type: 'income' | 'expense', amount: number, category: string, date: string, extra: Partial<Movement> = {}): Movement => ({
  id, type, amount, category: category as never, description: '', date, isRecurring: false, currency: '€', createdAt: date, ...extra,
});

const input = (over: Partial<ExportInput> = {}): ExportInput => ({
  accountName: 'Casa',
  isShared: false,
  memberCount: 1,
  currencySymbol: '€',
  dateFormat: 'DD/MM/YYYY',
  separators: { thousands: '.', decimal: ',' },
  exportedAt: new Date(2026, 8, 26),
  accent: '#1B2A4A',
  movements: [
    mov('1', 'income', 2000, 'salary', new Date(2026, 8, 1).toISOString(), { isRecurring: true, addedBy: 'ana' }),
    mov('2', 'expense', 1234.5, 'housing', new Date(2026, 8, 2).toISOString(), { addedBy: 'ana', note: 'Alquiler' }),
    mov('3', 'expense', 50.25, 'food', new Date(2026, 7, 20).toISOString(), { addedBy: 'pedro', note: '=HYPERLINK("x")' }),
  ],
  recurring: [],
  huchas: [],
  huchaMovements: [],
  category: (id) => ({ name: id === 'old' ? 'Borrada' : id, color: '#123456', deleted: id === 'old' }),
  incomeColor: (rank) => ['#00AA00', '#008800'][rank % 2],
  member: (uid) => (uid ? { name: uid === 'ana' ? 'Ana' : 'Pedro', isFormer: uid === 'pedro' } : undefined),
  t: (key, opts) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
  ...over,
});

// Lee un zip "stored" (el que escribe zip.ts): nombre -> contenido
const unzip = (bytes: Uint8Array) => {
  const files: Record<string, string> = {};
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;
  while (view.getUint32(pos, true) === 0x04034b50) {
    const crc = view.getUint32(pos + 14, true);
    const size = view.getUint32(pos + 18, true);
    const nameLen = view.getUint16(pos + 26, true);
    const extraLen = view.getUint16(pos + 28, true);
    const name = Buffer.from(bytes.subarray(pos + 30, pos + 30 + nameLen)).toString('utf8');
    const data = bytes.subarray(pos + 30 + nameLen + extraLen, pos + 30 + nameLen + extraLen + size);
    expect(crc32(data)).toBe(crc);
    files[name] = Buffer.from(data).toString('utf8');
    pos += 30 + nameLen + extraLen + size;
  }
  expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
  return files;
};

describe('zip', () => {
  it('calcula el CRC-32 estándar', () => {
    expect(crc32(utf8('123456789'))).toBe(0xcbf43926);
  });

  it('pasa a UTF-8 acentos y emojis, y cambia un surrogate suelto por U+FFFD', () => {
    expect(Buffer.from(utf8('ñ€😀')).toString('utf8')).toBe('ñ€😀');
    expect(Buffer.from(utf8('a\uD800b')).toString('utf8')).toBe('a�b');
  });

  it('empaqueta y se puede volver a leer', () => {
    const files = unzip(zip([{ name: 'a.txt', data: utf8('hola') }, { name: 'b/c.xml', data: utf8('<x/>') }]));
    expect(files).toEqual({ 'a.txt': 'hola', 'b/c.xml': '<x/>' });
  });
});

describe('resumen', () => {
  it('suma totales, meses (del más reciente) y categorías', () => {
    const s = summarize(input());
    expect(s).toMatchObject({ income: 2000, expense: 1284.75, balance: 715.25, count: 3 });
    expect(s.months.map((m) => [m.month, m.expense])).toEqual([[8, 1234.5], [7, 50.25]]);
    expect(s.expenseByCategory.map((c) => c.id)).toEqual(['housing', 'food']);
    expect(s.incomeByCategory[0].color).toBe('#00AA00');
  });

  it('en compartida reparte por miembro y junta los recurrentes aparte, al final', () => {
    const s = summarize(input({ isShared: true }));
    expect(s.members.map((m) => [m.name, m.isFormer, m.isRecurring])).toEqual([
      ['Ana', false, false], ['Pedro', true, false], ['export.recurringTitle', false, true],
    ]);
  });

  it('formatea importes y nombres de fichero como la app', () => {
    expect(formatMoney(-1234.5, input())).toBe('-1.234,50 €');
    expect(fileBaseName(input({ isShared: true, accountName: 'Casa Ñoño / 2026' }))).toBe('MoFlo_Casa_Nono_2026_2026-09-26');
    expect(fileBaseName(input())).toBe('MoFlo_2026-09-26');
  });
});

describe('CSV', () => {
  it('con coma decimal separa con punto y coma, e importes como número sin +', () => {
    const [header, first] = buildCsv(input()).replace('﻿', '').split('\r\n');
    expect(header.split(';')[0]).toBe('export.date');
    expect(first).toBe('02/09/2026;movements.expense;housing;Alquiler;-1234,50;€;export.no');
  });

  it('con punto decimal separa con comas', () => {
    const csv = buildCsv(input({ separators: { thousands: ',', decimal: '.' } }));
    expect(csv.split('\r\n')[1]).toBe('02/09/2026,movements.expense,housing,Alquiler,-1234.50,€,export.no');
  });

  it('una nota que parece fórmula se queda como texto', () => {
    expect(buildCsv(input())).toContain(`'=HYPERLINK(""x"")`);
  });

  it('en compartida lleva la columna del miembro', () => {
    expect(buildCsv(input({ isShared: true })).split('\r\n')[1].startsWith('Ana;')).toBe(true);
  });
});

describe('Excel', () => {
  it('es un .xlsx completo: resumen y movimientos, y el resto solo si hay datos', () => {
    const files = unzip(buildXlsx(input(), summarize(input())));
    expect(Object.keys(files)).toEqual(expect.arrayContaining([
      '[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels',
      'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml',
    ]));
    expect(files['xl/worksheets/sheet3.xml']).toBeUndefined();
    expect(files['xl/workbook.xml']).toContain('name="export.summaryTitle"');
  });

  it('escapa el texto de las personas y quita caracteres que XML no admite', () => {
    const data = input({ movements: [mov('x', 'expense', 1, 'food', new Date(2026, 0, 5).toISOString(), { note: 'A & B <c> "d"\u0007' })] });
    const sheet = unzip(buildXlsx(data, summarize(data)))['xl/worksheets/sheet2.xml'];
    expect(sheet).toContain('A &amp; B &lt;c&gt; &quot;d&quot;</t>');
    expect(sheet).not.toContain('\u0007');
  });

  it('las fechas son fechas de Excel y los importes, números con signo', () => {
    const data = input({ movements: [mov('x', 'expense', 12.5, 'food', new Date(2026, 0, 5, 18, 30).toISOString())] });
    const sheet = unzip(buildXlsx(data, summarize(data)))['xl/worksheets/sheet2.xml'];
    expect(sheet).toContain('<v>46027</v>'); // 05/01/2026
    expect(sheet).toContain('<v>-12.5</v>');
  });

  it('nombres de hoja válidos: sin caracteres prohibidos y sin repetir', () => {
    const data = input({ t: (k) => (k === 'export.summaryTitle' || k === 'export.movementsTitle' ? 'Mis/datos: [todo]' : k) });
    const workbook = unzip(buildXlsx(data, summarize(data)))['xl/workbook.xml'];
    expect(workbook).toContain('name="Mis datos   todo"');
    expect(workbook).toContain('name="Mis datos   todo 2"');
  });
});

describe('PDF', () => {
  it('escapa el texto de las personas y tacha lo borrado', () => {
    const data = input({
      isShared: true,
      movements: [mov('x', 'expense', 3, 'old', new Date(2026, 0, 5).toISOString(), { note: '<script>alert(1)</script>', addedBy: 'pedro' })],
    });
    const html = buildReportHtml(data, summarize(data), { pageMargin: '0' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<s>Borrada</s>');
    expect(html).toContain('<s>Pedro</s>');
  });

  it('sin movimientos lo dice en vez de dejar el informe vacío', () => {
    const data = input({ movements: [] });
    expect(buildReportHtml(data, summarize(data), { pageMargin: '0' })).toContain('export.noMovements');
  });
});
