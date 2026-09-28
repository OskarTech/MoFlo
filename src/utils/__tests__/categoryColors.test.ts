import {
  makeCategoryColors, BASE_EXPENSE_ORDER, readPaletteCategoryColors, choicesForPalette, withChoice,
} from '../categoryColors';
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

  it('el color elegido manda sobre el de su puesto, solo en su tipo', () => {
    const c = makeCategoryColors(set, [], { housing_expense: 4, salary_income: 3, other_expense: 0 });
    expect(c.expense('housing')).toBe(set.expense[4]);
    // "Otros" también puede tener color propio
    expect(c.expense('other')).toBe(set.expense[0]);
    expect(c.income(0, 'salary')).toBe(set.income[3]);
    // Otra categoría con el mismo id pero de otro tipo sigue con el suyo
    expect(c.income(0, 'housing')).toBe(set.income[0]);
    // Sin id (gráficos por puesto) no se aplica
    expect(c.income(1)).toBe(set.income[1]);
  });

  it('elegir color no cambia el de las demás', () => {
    const c = makeCategoryColors(set, [custom('a', '2026-01-01')], { housing_expense: 9 });
    expect(c.expense('food')).toBe(set.expense[1]);
    expect(c.expense('a')).toBe(set.expense[6]);
  });

  it('un color libre (#RRGGBB) se usa tal cual, en gastos y en ingresos', () => {
    const c = makeCategoryColors(set, [], { housing_expense: '#123456', salary_income: '#ABCDEF' });
    expect(c.expense('housing')).toBe('#123456');
    expect(c.income(0, 'salary')).toBe('#ABCDEF');
  });

  it('un texto que no es un color se ignora', () => {
    const c = makeCategoryColors(set, [], { housing_expense: 'rojo', food_expense: '#12345' });
    expect(c.expense('housing')).toBe(set.expense[0]);
    expect(c.expense('food')).toBe(set.expense[1]);
  });

  it('un índice guardado fuera de rango se repite y uno no válido se ignora', () => {
    const c = makeCategoryColors(set, [], { housing_expense: set.expense.length + 2, food_expense: -1 });
    expect(c.expense('housing')).toBe(set.expense[2]);
    expect(c.expense('food')).toBe(set.expense[1]);
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

describe('colores elegidos por paleta', () => {
  it('lo guardado por paletas se lee tal cual', () => {
    const saved = { green: { food_expense: 2 }, navy: { food_expense: '#123456' } };
    expect(readPaletteCategoryColors({ paletteCategoryColors: saved, categoryColors: { food_expense: 5 } }, 'green'))
      .toEqual({ colors: saved, migrated: false });
  });

  it('los de antes (uno para todas) pasan solo a la paleta en uso, y hay que guardarlo', () => {
    const { colors, migrated } = readPaletteCategoryColors({ categoryColors: { food_expense: 3 } }, 'rose');
    expect(migrated).toBe(true);
    expect(colors).toEqual({ rose: { food_expense: 3 } });
    expect(choicesForPalette(colors, 'green')).toEqual({});
  });

  it('sin nada guardado no hay colores ni nada que subir', () => {
    expect(readPaletteCategoryColors(undefined, 'green')).toEqual({ colors: {}, migrated: false });
    expect(readPaletteCategoryColors({ categoryColors: {} }, 'green')).toEqual({ colors: {}, migrated: false });
  });

  it('cambiar el color en una paleta no toca las demás', () => {
    const before = { green: { food_expense: 1 }, navy: { food_expense: 4 } };
    const after = withChoice(before, 'green', 'food_expense', '#ABCDEF');
    expect(after.green).toEqual({ food_expense: '#ABCDEF' });
    expect(after.navy).toBe(before.navy);
    expect(before.green).toEqual({ food_expense: 1 });
    // Automático: se quita de esa paleta y sigue en la otra
    const auto = withChoice(after, 'navy', 'food_expense', null);
    expect(auto.navy).toEqual({});
    expect(auto.green).toEqual({ food_expense: '#ABCDEF' });
  });

  it('con el color de una paleta, en otra la categoría vuelve a su color', () => {
    const all = withChoice({}, 'green', 'food_expense', 5);
    const earth = CATEGORY_COLORS.earth.light;
    expect(makeCategoryColors(set, [], choicesForPalette(all, 'green')).expense('food')).toBe(set.expense[5]);
    expect(makeCategoryColors(earth, [], choicesForPalette(all, 'earth')).expense('food')).toBe(earth.expense[1]);
  });
});
