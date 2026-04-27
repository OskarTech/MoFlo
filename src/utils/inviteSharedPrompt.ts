import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../i18n';
import { usePremiumStore } from '../store/premiumStore';
import { useSharedAccountStore } from '../store/sharedAccountStore';
import { getDaysSinceFirstLaunch } from './firstLaunch';

const STATUS_KEY = '@moflo_invite_shared_status';
const LAST_PROMPT_KEY = '@moflo_invite_shared_last_prompt';
const MIN_DAYS_AFTER_INSTALL = 7;
const MIN_DAYS_BETWEEN_PROMPTS = 14;

/**
 * Muestra un Alert invitando al usuario a crear una cuenta compartida si:
 * - Han pasado al menos 7 días desde el primer arranque.
 * - El usuario NO es premium.
 * - No ha desestimado el prompt permanentemente ('never') ni ya invitado ('invited').
 * - No tiene ya una cuenta compartida activa.
 * - Han pasado al menos 14 días desde el último prompt.
 *
 * `onAccept` se llama si el usuario pulsa "Invitar" (el callsite navega a SharedAccount).
 */
export const maybePromptForSharedInvite = async (
  onAccept: () => void,
): Promise<void> => {
  try {
    if (usePremiumStore.getState().isPremium) return;
    if (useSharedAccountStore.getState().sharedAccount) return;

    const status = await AsyncStorage.getItem(STATUS_KEY);
    if (status === 'never' || status === 'invited') return;

    const days = await getDaysSinceFirstLaunch();
    if (days < MIN_DAYS_AFTER_INSTALL) return;

    const lastPromptStr = await AsyncStorage.getItem(LAST_PROMPT_KEY);
    if (lastPromptStr) {
      const daysSince = (Date.now() - parseInt(lastPromptStr, 10)) / (1000 * 60 * 60 * 24);
      if (daysSince < MIN_DAYS_BETWEEN_PROMPTS) return;
    }

    await AsyncStorage.setItem(LAST_PROMPT_KEY, String(Date.now()));

    const t = i18n.t.bind(i18n);
    Alert.alert(
      t('inviteShared.askTitle'),
      t('inviteShared.askMessage'),
      [
        {
          text: t('inviteShared.askLater'),
          style: 'cancel',
        },
        {
          text: t('inviteShared.askYes'),
          onPress: async () => {
            await AsyncStorage.setItem(STATUS_KEY, 'invited');
            onAccept();
          },
        },
      ],
      { cancelable: true },
    );
  } catch (e) {
    console.error('Error showing invite shared prompt:', e);
  }
};
