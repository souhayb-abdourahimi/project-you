import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en';
import fr from './locales/fr';

export type AppLocale = 'fr' | 'en';

export function deviceLocale(): AppLocale {
  const code = getLocales()[0]?.languageCode;
  return code === 'en' ? 'en' : 'fr';
}

if (!i18n.isInitialized) {
  // eslint-disable-next-line import/no-named-as-default-member
  void i18n.use(initReactI18next).init({
    resources: { fr: { translation: fr }, en: { translation: en } },
    lng: deviceLocale(),
    fallbackLng: 'fr',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export default i18n;
