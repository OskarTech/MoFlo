import AsyncStorage from '@react-native-async-storage/async-storage';
import { EMPTY_COMPOUND_INPUTS, loadCompoundInputs, saveCompoundInputs } from '../compoundInputs';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const FILLED = {
  initial: '1.000', monthly: '150,50', rate: '7', years: '20',
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('lo escrito en la calculadora de interés compuesto', () => {
  it('sin nada guardado, los campos vacíos', async () => {
    await expect(loadCompoundInputs('ana')).resolves.toEqual(EMPTY_COMPOUND_INPUTS);
  });

  it('vuelve tal cual se escribió', async () => {
    await saveCompoundInputs('ana', FILLED);
    await expect(loadCompoundInputs('ana')).resolves.toEqual(FILLED);
  });

  it('es de cada persona: otra cuenta en el mismo móvil no lo ve', async () => {
    await saveCompoundInputs('ana', FILLED);
    await expect(loadCompoundInputs('luis')).resolves.toEqual(EMPTY_COMPOUND_INPUTS);
  });

  it('al vaciar todos los campos a mano no queda nada guardado', async () => {
    await saveCompoundInputs('ana', FILLED);
    await saveCompoundInputs('ana', EMPTY_COMPOUND_INPUTS);
    expect(await AsyncStorage.getItem('@moflo_compound_ana')).toBeNull();
    await expect(loadCompoundInputs('ana')).resolves.toEqual(EMPTY_COMPOUND_INPUTS);
  });

  it('con un campo escrito se sigue guardando', async () => {
    await saveCompoundInputs('ana', { ...EMPTY_COMPOUND_INPUTS, years: '10' });
    await expect(loadCompoundInputs('ana')).resolves.toEqual({ ...EMPTY_COMPOUND_INPUTS, years: '10' });
  });

  it('algo roto o raro guardado no rompe nada', async () => {
    await AsyncStorage.setItem('@moflo_compound_ana', '{no es json');
    await expect(loadCompoundInputs('ana')).resolves.toEqual(EMPTY_COMPOUND_INPUTS);

    await AsyncStorage.setItem('@moflo_compound_ana', JSON.stringify({ initial: 1000, rate: '7', otro: 'x' }));
    await expect(loadCompoundInputs('ana')).resolves.toEqual({ ...EMPTY_COMPOUND_INPUTS, rate: '7' });

    await AsyncStorage.setItem('@moflo_compound_ana', 'null');
    await expect(loadCompoundInputs('ana')).resolves.toEqual(EMPTY_COMPOUND_INPUTS);
  });

  it('lo guardado con los campos que ya no están (subida anual, inflación) se sigue leyendo', async () => {
    await AsyncStorage.setItem('@moflo_compound_ana', JSON.stringify({ ...FILLED, increase: '3', inflation: '2,5' }));
    await expect(loadCompoundInputs('ana')).resolves.toEqual(FILLED);
  });
});
