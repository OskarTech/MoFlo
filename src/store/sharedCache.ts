import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Copias en el móvil de los datos de la cuenta compartida, para enseñarlos al
 * momento y sin conexión. Va una por cuenta: antes había una sola para
 * cualquiera y, tras salir de una cuenta y entrar en otra, la nueva enseñaba
 * los movimientos de la anterior (sin conexión, hasta recuperarla).
 */
export const SHARED_CACHE = {
  MOVEMENTS: '@moflo_shared_movements',
  RECURRING: '@moflo_shared_recurring',
  HUCHAS: '@moflo_shared_huchas',
  HUCHA_MOVEMENTS: '@moflo_shared_hucha_movements',
  // Que el código de invitación de la cuenta ya está en inviteCodes
  INVITE_CODE: '@moflo_shared_invite_code',
};

export const sharedCacheKey = (base: string, accountId: string) => `${base}_${accountId}`;

/**
 * La copia de esa cuenta, o null si no hay. La copia única de antes se pasa a
 * la primera cuenta que la pida: era la de la cuenta en la que se estaba y, si
 * no lo fuera, la primera carga con conexión la reemplaza, como hasta ahora.
 */
export const readSharedCache = async (base: string, accountId: string): Promise<string | null> => {
  const key = sharedCacheKey(base, accountId);
  const own = await AsyncStorage.getItem(key);
  if (own != null) return own;
  const legacy = await AsyncStorage.getItem(base);
  if (legacy == null) return null;
  await AsyncStorage.setItem(key, legacy);
  await AsyncStorage.removeItem(base);
  return legacy;
};

/** Todas las copias de cuentas compartidas, al cerrar sesión o borrar la cuenta */
export const removeSharedCaches = async () => {
  const bases = Object.values(SHARED_CACHE);
  const keys = await AsyncStorage.getAllKeys();
  const ours = keys.filter((k) => bases.some((b) => k === b || k.startsWith(`${b}_`)));
  if (ours.length > 0) await AsyncStorage.multiRemove(ours);
};
