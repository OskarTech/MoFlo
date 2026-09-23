import { logBreadcrumb } from '../services/crashReporting';

/**
 * En producción la consola queda muda.
 *
 * La app dejaba 68 llamadas a console.log, warn y error activas en las builds
 * publicadas. En Android acaban en el registro del sistema, que en algunas
 * versiones pueden leer otras apps, y varias de esas llamadas imprimen
 * documentos completos de Firestore con datos del usuario.
 *
 * Los errores no se tiran: se guardan como rastro en Crashlytics, así que si
 * después ocurre un cierre inesperado aparecen junto al informe y sirven para
 * entender qué pasaba antes. Eso no genera informes por su cuenta, así que no
 * inunda el panel.
 *
 * En desarrollo no se toca nada: la consola funciona igual que siempre.
 */

const MAX_BREADCRUMB_LENGTH = 500;

const describe = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

if (!__DEV__) {
  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.debug = noop;
  console.warn = noop;
  console.error = (...args: unknown[]) => {
    try {
      logBreadcrumb(args.map(describe).join(' ').slice(0, MAX_BREADCRUMB_LENGTH));
    } catch {
      // El propio registro nunca debe tumbar la app
    }
  };
}

export {};
