import { largeAmountSizes } from '../amountSize';

describe('largeAmountSizes', () => {
  it('usa la cifra grande con importes normales', () => {
    expect(largeAmountSizes('0', '€')).toEqual({ amount: 56, symbol: 30 });
    expect(largeAmountSizes('24,90', '€')).toEqual({ amount: 56, symbol: 30 });
    expect(largeAmountSizes('12345,67', '€')).toEqual({ amount: 56, symbol: 30 });
  });

  it('baja la letra con importes largos', () => {
    expect(largeAmountSizes('123456,78', '€')).toEqual({ amount: 48, symbol: 26 });
    expect(largeAmountSizes('1234567,89', '€')).toEqual({ amount: 48, symbol: 26 });
    expect(largeAmountSizes('12345678,90', '€')).toEqual({ amount: 40, symbol: 22 });
    // El campo admite hasta 12 caracteres
    expect(largeAmountSizes('123456789,12', '$')).toEqual({ amount: 40, symbol: 22 });
  });

  it('cuenta un símbolo largo como cifras de más', () => {
    expect(largeAmountSizes('123456,7', '$')).toEqual({ amount: 56, symbol: 30 });
    expect(largeAmountSizes('123456,7', 'CHF')).toEqual({ amount: 48, symbol: 26 });
    expect(largeAmountSizes('1234567,8', 'MX$')).toEqual({ amount: 40, symbol: 22 });
    expect(largeAmountSizes('1234567', 'zł')).toEqual({ amount: 56, symbol: 30 });
  });
});
