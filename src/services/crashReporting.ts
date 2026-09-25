/**
 * Registro de errores en producción.
 *
 * Hasta ahora un fallo en manos de un usuario era invisible: el ErrorBoundary
 * solo escribía en consola bajo `__DEV__`, así que en las tiendas se perdía.
 * Crashlytics recoge por su cuenta los cierres inesperados nativos y las
 * excepciones de JavaScript sin capturar; este módulo añade además los errores
 * que la app sí captura pero que conviene conocer.
 *
 * Antes de tocar el paquete se comprueba que el módulo nativo esté presente:
 * si la build instalada se generó antes de añadir la dependencia, aquí se
 * devuelve null y la app sigue funcionando en vez de romperse.
 */

import { NativeModules } from 'react-native';

type CrashlyticsModule = typeof import('@react-native-firebase/crashlytics');

let cached: CrashlyticsModule | null | undefined;

const getModule = (): CrashlyticsModule | null => {
  if (cached !== undefined) return cached;
  // Envolver el require no basta: el paquete JS puede estar en node_modules
  // mientras el módulo nativo no entró en la build. RNFirebase no falla al
  // importar, sino al instanciar el módulo, así que el error se escapaba de
  // este try. Comprobamos el nativo igual que hace RNFirebase por dentro
  // (getReactNativeModule -> NativeModules[nombre]).
  if (!NativeModules.RNFBCrashlyticsModule) {
    cached = null;
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- solo se carga si el módulo nativo existe: con un import arriba, una build sin Crashlytics se rompía al arrancar
    cached = require('@react-native-firebase/crashlytics') as CrashlyticsModule;
  } catch {
    cached = null;
  }
  return cached;
};

// JSON.stringify lanza ante estructuras circulares, y esto corre dentro de los
// catch de media app: si fallase aquí, el reportero tumbaría justo lo que
// intentaba contener.
const stringify = (value: unknown): string => {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

const toError = (error: unknown): Error => {
  if (error instanceof Error) return error;
  return new Error(typeof error === 'string' ? error : stringify(error));
};

// Nunca se propaga un fallo del propio registro de errores: sería irónico que
// la telemetría tumbase la app que intenta vigilar.
const safe = (run: (m: CrashlyticsModule) => void) => {
  try {
    const m = getModule();
    if (!m) return;
    run(m);
  } catch {
    // silencio intencionado
  }
};

/**
 * Error que la app ha capturado pero que no debería estar ocurriendo.
 * En desarrollo se queda en consola para no ensuciar el panel de Crashlytics.
 */
export const reportError = (error: unknown, context?: string): void => {
  const normalized = toError(error);

  if (__DEV__) {
    console.error(context ? `[${context}]` : '[error]', normalized);
    return;
  }

  safe((m) => {
    const instance = m.getCrashlytics();
    if (context) m.log(instance, context);
    m.recordError(instance, normalized);
  });
};

/** Deja rastro de por dónde iba el usuario antes de un fallo. */
export const logBreadcrumb = (message: string): void => {
  if (__DEV__) return;
  safe((m) => m.log(m.getCrashlytics(), message));
};

/**
 * Alinea iOS con Android en cuanto a builds de depuración.
 *
 * Android desactiva por su cuenta la recogida cuando BuildConfig.DEBUG está
 * activo; en iOS no hay nada equivalente, así que sin esto una build de
 * desarrollo mandaría sus cierres al panel mezclados con los de usuarios
 * reales. Se llama una sola vez al arrancar.
 */
export const initCrashReporting = (): void => {
  safe((m) => {
    m.setCrashlyticsCollectionEnabled(m.getCrashlytics(), !__DEV__).catch(() => {});
  });
};

/**
 * Asocia los informes al usuario para poder responder a un aviso concreto.
 * Solo el uid de Firebase: ni correo, ni nombre, ni ningún dato personal.
 */
export const setCrashUser = (uid: string | null): void => {
  safe((m) => {
    const instance = m.getCrashlytics();
    m.setUserId(instance, uid ?? '').catch(() => {});
  });
};
