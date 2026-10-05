import { useSettingsStore } from '../store/settingsStore';
import { useSharedAccountStore } from '../store/sharedAccountStore';
import { normalizeStartDay } from '../utils/period';

/**
 * Día en que empieza el mes de la cuenta en la que se está: el de la
 * individual o el de la compartida, como la moneda (ver utils/period)
 */
export const useMonthStartDay = (): number => {
  const isSharedMode = useSharedAccountStore((s) => s.isSharedMode);
  const shared = useSharedAccountStore((s) => s.sharedMonthStartDay);
  const personal = useSettingsStore((s) => s.monthStartDay);
  return normalizeStartDay(isSharedMode ? shared : personal);
};

/** Lo mismo fuera de un componente */
export const getMonthStartDay = (): number => {
  const { isSharedMode, sharedMonthStartDay } = useSharedAccountStore.getState();
  return normalizeStartDay(isSharedMode ? sharedMonthStartDay : useSettingsStore.getState().monthStartDay);
};
