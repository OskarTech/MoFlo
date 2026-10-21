import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';
import { reportError } from '../services/crashReporting';
import { BUSINESS_ENABLED } from './featureFlag';

/**
 * Quién ve la cuenta de empresa: solo las cuentas con su documento en
 * businessAccess/{uid}, que se pone a mano desde la consola de Firebase. Las
 * reglas tampoco dejan, sin él, crear una empresa, pedir entrar en una ni leer
 * un código. Para el resto, la app es la de siempre: ni la opción en el
 * selector ni una lectura de la empresa.
 *
 * Se mira al iniciar sesión y en cada arranque (una lectura), y la respuesta
 * se guarda en el móvil: sin conexión se arranca con la última.
 */

interface AccessState {
  uid: string | null;
  allowed: boolean;
}

export const useBusinessAccess = create<AccessState>(() => ({ uid: null, allowed: false }));

const cacheKey = (uid: string) => `@moflo_biz_access_${uid}`;

/** Si esta cuenta ve la empresa (con la última respuesta conocida) */
export const businessAllowed = (): boolean => BUSINESS_ENABLED && useBusinessAccess.getState().allowed;

const settle = async (uid: string, allowed: boolean, onChange?: (allowed: boolean) => void) => {
  if (useBusinessAccess.getState().uid !== uid) return;
  await AsyncStorage.setItem(cacheKey(uid), allowed ? '1' : '0').catch(() => {});
  if (allowed === useBusinessAccess.getState().allowed) return;
  useBusinessAccess.setState({ allowed });
  onChange?.(allowed);
};

/**
 * Al iniciar sesión: devuelve la última respuesta guardada, al momento, y
 * pregunta al servidor por detrás. onChange, si el servidor dice otra cosa (se
 * le acaba de dar o de quitar el acceso)
 */
export const loadBusinessAccess = async (uid: string, onChange?: (allowed: boolean) => void): Promise<boolean> => {
  if (!BUSINESS_ENABLED) return false;
  const cached = (await AsyncStorage.getItem(cacheKey(uid)).catch(() => null)) === '1';
  useBusinessAccess.setState({ uid, allowed: cached });
  firestore().collection('businessAccess').doc(uid).get()
    .then((snap) => {
      // De la caché de Firestore (sin conexión): se sigue con lo guardado
      if (snap.metadata.fromCache) return;
      return settle(uid, snap.exists(), onChange);
    })
    .catch((e) => {
      // Sin permiso, como sin acceso; sin conexión, se sigue con lo guardado
      if ((e as { code?: string })?.code === 'firestore/permission-denied') return settle(uid, false, onChange);
      if ((e as { code?: string })?.code !== 'firestore/unavailable') reportError(e, 'empresa: acceso');
      return undefined;
    });
  return cached;
};

/** Al cerrar sesión */
export const resetBusinessAccess = () => useBusinessAccess.setState({ uid: null, allowed: false });
