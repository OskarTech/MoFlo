import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import en from './locales/en.json';
import es from './locales/es.json';
import pl from './locales/pl.json';
import fr from './locales/fr.json';
import pt from './locales/pt.json';
import it from './locales/it.json';
import de from './locales/de.json';

const rawTag = Localization.getLocales()[0]?.languageTag ?? 'en';
const languageTag = rawTag.split('-')[0];

i18n.use(initReactI18next).init({
  compatibilityJSON: 'v4',
  resources: {
    en: { translation: en },
    es: { translation: es },
    pl: { translation: pl },
    fr: { translation: fr },
    pt: { translation: pt },
    it: { translation: it },
    de: { translation: de },
  },
  lng: languageTag,
  fallbackLng: 'en', // Si el idioma no está disponible, usa inglés
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
