import { makeCategoryColors, BASE_EXPENSE_ORDER } from '../categoryColors';
import { CATEGORY_COLORS } from '../../theme/categoryColors';
import { COLOR_PALETTES } from '../../theme';
import { Category } from '../../types';

const set = CATEGORY_COLORS.green.light;

const custom = (id: string, createdAt: string, extra: Partial<Category> = {}): Category => ({
  id, name: id, type: 'expense', icon: 'star', isCustom: true, createdAt, ...extra,
});

describe('makeCategoryColors', () => {
  it('cada predeterminada tiene siempre su color', () => {
    const c = makeCategoryColors(set, []);
    BASE_EXPENSE_ORDER.forEach((id, i) => expect(c.expense(id)).toBe(set.expense[i]));
  });

  it('"Otros" y lo desconocido van en gris', () => {
    const c = makeCategoryColors(set, []);
    expect(c.expense('other')).toBe(set.expenseOther);
    expect(c.expense('no-existe')).toBe(set.expenseOther);
  });

  it('las propias siguen a las predeterminadas por orden de creación, y luego se repiten', () => {
    const c = makeCategoryColors(set, [
      custom('c', '2026-03-01'), custom('a', '2026-01-01'), custom('b', '2026-02-01'),
    ]);
    expect(c.expense('a')).toBe(set.expense[6]);
    expect(c.expense('b')).toBe(set.expense[7]);
    expect(c.expense('c')).toBe(set.expense[8]);
    // La 7.ª propia es la 13.ª categoría: vuelve al primer color
    const seven = makeCategoryColors(set, [1, 2, 3, 4, 5, 6, 7].map((n) => custom(`p${n}`, `2026-0${n}-01`)));
    expect(seven.expense('p6')).toBe(set.expense[11]);
    expect(seven.expense('p7')).toBe(set.expense[0]);
  });

  it('borrar una no cambia el color de las demás, y la borrada conserva el suyo', () => {
    const before = makeCategoryColors(set, [custom('a', '2026-01-01'), custom('b', '2026-02-01')]);
    const after = makeCategoryColors(set, [
      custom('a', '2026-01-01', { deleted: true }), custom('b', '2026-02-01'),
    ]);
    expect(after.expense('a')).toBe(before.expense('a'));
    expect(after.expense('b')).toBe(before.expense('b'));
  });

  it('las propias de ingresos no ocupan sitio entre los gastos', () => {
    const c = makeCategoryColors(set, [
      custom('ing', '2026-01-01', { type: 'income' }), custom('gasto', '2026-02-01'),
    ]);
    expect(c.expense('gasto')).toBe(set.expense[6]);
  });

  it('el gráfico de gastos va siempre en el mismo orden, con "Otros" al final', () => {
    const c = makeCategoryColors(set, [custom('a', '2026-01-01')]);
    const sorted = ['other', 'a', 'transport', 'housing']
      .sort((x, y) => c.expenseOrder(x) - c.expenseOrder(y));
    expect(sorted).toEqual(['housing', 'transport', 'a', 'other']);
  });

  it('los ingresos van por puesto y se repiten al acabarse', () => {
    const c = makeCategoryColors(set, []);
    expect(c.income(0)).toBe(set.income[0]);
    expect(c.income(set.income.length)).toBe(set.income[0]);
  });
});

describe('CATEGORY_COLORS', () => {
  it('cada paleta tiene sus colores, en claro y en oscuro', () => {
    const hex = /^#[0-9A-F]{6}$/;
    Object.keys(COLOR_PALETTES).forEach((id) => {
      const entry = CATEGORY_COLORS[id as keyof typeof COLOR_PALETTES];
      expect(entry).toBeDefined();
      (['light', 'dark'] as const).forEach((mode) => {
        const s = entry[mode];
        expect(s.expense).toHaveLength(12);
        expect(s.income).toHaveLength(12);
        [...s.expense, s.expenseOther, ...s.income].forEach((c) => expect(c).toMatch(hex));
      });
    });
  });
});
