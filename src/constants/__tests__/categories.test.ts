import { BASE_CATEGORIES, getBaseCategoryIcon } from '../categories';

// Los movimientos siguen mostrando el icono de una categoría base aunque el
// usuario la haya ocultado: la búsqueda no mira qué está oculto
describe('getBaseCategoryIcon', () => {
  it('devuelve el icono de cada categoría base', () => {
    for (const c of BASE_CATEGORIES) {
      expect(getBaseCategoryIcon(c.id, c.type)).toBe(c.icon);
    }
  });

  it('encuentra la categoría aunque el tipo no coincida', () => {
    expect(getBaseCategoryIcon('transport', 'income')).toBe('car');
  });

  it('no inventa un icono para lo que no es una categoría base', () => {
    expect(getBaseCategoryIcon('custom_123', 'expense')).toBeUndefined();
  });
});
