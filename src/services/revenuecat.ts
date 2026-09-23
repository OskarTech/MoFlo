import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Purchases, { CustomerInfo, PURCHASES_ERROR_CODE } from 'react-native-purchases';
import auth from '@react-native-firebase/auth';
import { REVENUECAT_API_KEY } from '../constants/revenuecat';
import { reportError } from './crashReporting';

/** Identificador del entitlement tal y como está dado de alta en RevenueCat. */
const PREMIUM_ENTITLEMENT = 'premium';

/** Marca, por usuario, que ya se intentó rescatar una compra huérfana. */
const RECOVERY_KEY = '@moflo_premium_recovered';

let configured = false;

/** Las llamadas a identify se encadenan para no lanzar dos logIn a la vez. */
let queue: Promise<unknown> = Promise.resolve();

export const hasPremiumEntitlement = (info: CustomerInfo): boolean =>
  !!info.entitlements.active[PREMIUM_ENTITLEMENT];

const identify = async (): Promise<string | null> => {
  if (!configured) {
    // configure() es síncrono y el SDK encola lo que venga detrás, así que no
    // hay nada que esperar aquí. Se hace una sola vez: reconfigurar el SDK en
    // mitad de una compra reinicia la conexión con la tienda.
    Purchases.configure({ apiKey: REVENUECAT_API_KEY });
    configured = true;
  }

  const uid = auth().currentUser?.uid ?? null;
  if (!uid) return null;

  // Solo cuando hace falta: repetir el logIn en cada compra no aporta nada.
  if ((await Purchases.getAppUserID()) !== uid) {
    await Purchases.logIn(uid);
  }
  return uid;
};

/**
 * Configura el SDK y deja al usuario de RevenueCat apuntando al uid de
 * Firebase. Hay que llamarlo antes de cualquier operación de compra.
 *
 * Antes cada sitio llamaba a `Purchases.configure()` por su cuenta y solo el
 * arranque hacía `logIn`. Si esa carga no llegaba a tiempo —tiene un tope de
 * 5 s y se la salta cualquier problema de red— la compra se registraba bajo el
 * usuario anónimo del SDK en vez de bajo el uid. Mientras el móvil conservaba
 * ese anónimo todo parecía funcionar, pero al reinstalar o cambiar de
 * dispositivo la compra quedaba huérfana: no aparecía el premium, restaurar no
 * encontraba nada y volver a comprar tampoco era posible, porque la tienda
 * responde que ese producto ya se posee.
 *
 * Devuelve el uid con el que ha quedado identificado, o null si no hay sesión.
 */
export const ensurePurchasesUser = (): Promise<string | null> => {
  const next = queue.then(identify, identify);
  queue = next.catch(() => {});
  return next;
};

/**
 * Suelta el usuario del SDK al cerrar sesión o al borrar la cuenta. Sin esto,
 * el siguiente que entre en el mismo móvil hereda el App User ID del anterior.
 */
export const resetPurchasesUser = async (): Promise<void> => {
  if (!configured) return;

  const release = async () => {
    try {
      // logOut sobre un usuario anónimo no es un no-op: el SDK lo rechaza.
      if (!(await Purchases.isAnonymous())) await Purchases.logOut();
    } catch (e) {
      reportError(e, 'resetPurchasesUser');
    }
  };

  // Con un tope de tiempo, como el resto del cierre de sesión: si la red va
  // mal, el botón no se queda colgado esperando a la tienda.
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 3000));
  await Promise.race([release(), timeout]);
};

/**
 * Un único intento, por usuario y dispositivo, de recuperar una compra que
 * quedó atada a otro App User ID. Quien llama decide cuándo procede: con las
 * transferencias activadas en RevenueCat una restauración mueve la compra a
 * quien la pide, así que esto no debe dispararse en una cuenta que nunca tuvo
 * el premium en este móvil.
 *
 * Solo en Android: ahí `restorePurchases()` consulta a Google Play sin enseñar
 * nada al usuario. En iOS el sistema puede pedir las credenciales de App Store,
 * así que allí la restauración sigue siendo solo manual, con el botón de
 * siempre.
 */
export const tryRecoverPurchase = async (uid: string): Promise<CustomerInfo | null> => {
  if (Platform.OS !== 'android') return null;

  const key = `${RECOVERY_KEY}_${uid}`;
  if ((await AsyncStorage.getItem(key)) === 'true') return null;

  try {
    const info = await Purchases.restorePurchases();
    await AsyncStorage.setItem(key, 'true');
    return info;
  } catch (e: any) {
    // Un fallo de red no gasta el intento; cualquier otro sí, para no repetir
    // la consulta en cada arranque.
    if (e?.code !== PURCHASES_ERROR_CODE.NETWORK_ERROR) {
      await AsyncStorage.setItem(key, 'true').catch(() => {});
    }
    reportError(e, 'tryRecoverPurchase');
    return null;
  }
};
