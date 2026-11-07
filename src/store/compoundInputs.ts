import AsyncStorage from '@react-native-async-storage/async-storage';

/** Lo escrito en la calculadora de interés compuesto, tal cual se escribió */
export interface CompoundInputs {
  initial: string;
  monthly: string;
  rate: string;
  years: string;
}

export const EMPTY_COMPOUND_INPUTS: CompoundInputs = {
  initial: '', monthly: '', rate: '', years: '',
};

// Solo en este móvil y con el id de quien lo escribió: si entra otra persona,
// no los ve. Como los recordatorios, no se borran al cerrar sesión ni con
// «Borrar datos»: quien los quiera quitar vacía los campos a mano
const keyOf = (uid: string) => `@moflo_compound_${uid}`;

/** Lo último que escribió esa persona; vacío si no hay nada o no se puede leer */
export const loadCompoundInputs = async (uid: string): Promise<CompoundInputs> => {
  try {
    const raw = await AsyncStorage.getItem(keyOf(uid));
    if (!raw) return EMPTY_COMPOUND_INPUTS;
    const saved = JSON.parse(raw) as Partial<Record<keyof CompoundInputs, unknown>> | null;
    // Solo los campos que existen y solo textos: algo raro guardado no rompe la
    // pantalla, y lo de campos que ya no están (subida anual, inflación) se ignora
    const field = (name: keyof CompoundInputs) => {
      const value = saved?.[name];
      return typeof value === 'string' ? value : '';
    };
    return {
      initial: field('initial'),
      monthly: field('monthly'),
      rate: field('rate'),
      years: field('years'),
    };
  } catch {
    return EMPTY_COMPOUND_INPUTS;
  }
};

/** Guarda lo escrito. Con todos los campos vacíos no se queda nada guardado */
export const saveCompoundInputs = async (uid: string, inputs: CompoundInputs): Promise<void> => {
  if (Object.values(inputs).every((value) => !value)) {
    await AsyncStorage.removeItem(keyOf(uid));
    return;
  }
  await AsyncStorage.setItem(keyOf(uid), JSON.stringify(inputs));
};
