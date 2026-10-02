/**
 * Tamaño de la cifra grande de las ventanas de añadir (y de su símbolo). Con
 * importes largos baja para que quepan en el ancho de un móvil pequeño: el
 * símbolo cuenta como cifras de más si es largo (CHF, MX$)
 */
export const largeAmountSizes = (text: string, currencySymbol: string) => {
  const length = text.length + Math.max(0, currencySymbol.length - 1);
  if (length <= 8) return { amount: 56, symbol: 30 };
  if (length <= 10) return { amount: 48, symbol: 26 };
  return { amount: 40, symbol: 22 };
};
