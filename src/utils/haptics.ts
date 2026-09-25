import { useSettingsStore } from '../store/settingsStore';

type HapticsModule = typeof import('expo-haptics');

let cached: HapticsModule | null | undefined;

/**
 * expo-haptics es un módulo nativo. Si la build instalada en el dispositivo se
 * generó antes de añadir la dependencia, el módulo nativo no existe: aquí se
 * devuelve null y la app sigue funcionando sin vibrar, en lugar de romperse.
 *
 * El feedback se sentirá en cuanto se genere una build nueva.
 */
const getHaptics = (): HapticsModule | null => {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- opcional: si la build no trae el módulo nativo, la app sigue funcionando sin vibrar
    cached = require('expo-haptics') as HapticsModule;
  } catch {
    cached = null;
  }
  return cached;
};

// Nunca se propaga un fallo de vibración: es un detalle accesorio, jamás debe
// tumbar la acción que lo dispara.
const safe = (run: (h: HapticsModule) => Promise<void> | void) => {
  if (!useSettingsStore.getState().hapticsEnabled) return;
  const h = getHaptics();
  if (!h) return;
  try {
    const result = run(h);
    if (result && typeof result.then === 'function') result.catch(() => {});
  } catch {
    // silencio intencionado
  }
};

/** Tic muy leve: abrir una fila deslizable, cambiar de filtro. */
export const selectionHaptic = () => safe(h => h.selectionAsync());

/** Impacto ligero: abrir un menú con pulsación larga. */
export const lightHaptic = () => safe(h => h.impactAsync(h.ImpactFeedbackStyle.Light));

/** Confirmación de guardado. */
export const successHaptic = () =>
  safe(h => h.notificationAsync(h.NotificationFeedbackType.Success));

/** Acción destructiva completada. */
export const warningHaptic = () =>
  safe(h => h.notificationAsync(h.NotificationFeedbackType.Warning));
