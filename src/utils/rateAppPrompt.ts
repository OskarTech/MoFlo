import { Alert, Platform, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import i18n from '../i18n';

const STATUS_KEY = '@moflo_rate_status';
const LAST_PROMPT_KEY = '@moflo_rate_last_prompt';
const MIN_DAYS_BETWEEN_PROMPTS = 3;

type RatePromptReason = 'second_hucha' | 'goal_complete';

const openStore = async () => {
  if (await StoreReview.hasAction()) {
    await StoreReview.requestReview();
  } else {
    const url = Platform.OS === 'ios'
      ? 'itms-apps://itunes.apple.com/app/id6762832281?action=write-review'
      : 'https://play.google.com/store/apps/details?id=com.oskartech.moflo';
    Linking.openURL(url);
  }
};

export const maybePromptForRating = async (reason: RatePromptReason): Promise<void> => {
  try {
    const status = await AsyncStorage.getItem(STATUS_KEY);
    if (status === 'never' || status === 'rated') return;

    const lastPromptStr = await AsyncStorage.getItem(LAST_PROMPT_KEY);
    if (lastPromptStr) {
      const daysSince = (Date.now() - parseInt(lastPromptStr, 10)) / (1000 * 60 * 60 * 24);
      if (daysSince < MIN_DAYS_BETWEEN_PROMPTS) return;
    }

    await AsyncStorage.setItem(LAST_PROMPT_KEY, String(Date.now()));

    const t = i18n.t.bind(i18n);
    const message = reason === 'goal_complete'
      ? t('rate.askMessageGoalComplete')
      : t('rate.askMessageSecondHucha');

    Alert.alert(
      t('rate.askTitle'),
      message,
      [
        {
          text: t('rate.askNever'),
          style: 'destructive',
          onPress: () => { AsyncStorage.setItem(STATUS_KEY, 'never'); },
        },
        {
          text: t('rate.askLater'),
          style: 'cancel',
        },
        {
          text: t('rate.askYes'),
          onPress: async () => {
            await AsyncStorage.setItem(STATUS_KEY, 'rated');
            await openStore();
          },
        },
      ],
      { cancelable: true },
    );
  } catch (e) {
    console.error('Error showing rate prompt:', e);
  }
};
