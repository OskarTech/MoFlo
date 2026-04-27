import AsyncStorage from '@react-native-async-storage/async-storage';

const FIRST_LAUNCH_KEY = '@moflo_first_launch';

/**
 * Registra el timestamp del primer arranque si no existe ya.
 * Idempotente: llamar varias veces no sobrescribe el valor inicial.
 */
export const recordFirstLaunch = async (): Promise<void> => {
  try {
    const existing = await AsyncStorage.getItem(FIRST_LAUNCH_KEY);
    if (!existing) {
      await AsyncStorage.setItem(FIRST_LAUNCH_KEY, String(Date.now()));
    }
  } catch {}
};

/**
 * Días transcurridos desde el primer arranque (0 si nunca se registró).
 */
export const getDaysSinceFirstLaunch = async (): Promise<number> => {
  try {
    const ts = await AsyncStorage.getItem(FIRST_LAUNCH_KEY);
    if (!ts) return 0;
    return (Date.now() - parseInt(ts, 10)) / (1000 * 60 * 60 * 24);
  } catch {
    return 0;
  }
};
