/**
 * Registro de errores en producción.
 *
 * Hasta ahora un fallo en manos de un usuario era invisible: el ErrorBoundary
 * solo escribía en consola bajo `__DEV__`, así que en las tiendas se perdía.
 * Crashlytics recoge por su cuenta los cierres inesperados nativos y las
 * excepciones de JavaScript sin capturar; este módulo añade además los errores
 * que la app sí captura pero que conviene conocer.
 *
 * El módulo nativo se carga con require dentro de un try, igual que
 * expo-haptics: si la build instalada se generó antes de añadir la dependencia,
 * aquí se devuelve null y la app sigue funcionando en vez de romperse.
 */

type CrashlyticsModule = typeof import('@react-native-firebase/crashlytics');

let cached: CrashlyticsModule | null | undefined;

const getModule = (): CrashlyticsModule | null => {
  if (cached !== undefined) return cached;
  try {
    cached = require('@react-native-firebase/crashlytics') as CrashlyticsModule;
  } catch {
    cached = null;
  }
  return cached;
};

// Nunca se propaga un fallo del propio registro de errores: sería irónico que
// la telemetría tumbase la app que intenta vigilar.
const safe = (run: (m: CrashlyticsModule) => void) => {
  const m = getModule();
  if (!m) return;
  try {
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
  const normalized = error instanceof Error
    ? error
    : new Error(typeof error === 'string' ? error : JSON.stringify(error));

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
 * Asocia los informes al usuario para poder responder a un aviso concreto.
 * Solo el uid de Firebase: ni correo, ni nombre, ni ningún dato personal.
 */
export const setCrashUser = (uid: string | null): void => {
  safe((m) => {
    const instance = m.getCrashlytics();
    m.setUserId(instance, uid ?? '').catch(() => {});
  });
};
