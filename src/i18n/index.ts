import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { formatMass } from '@/lib/format';
import type { MassUnit } from '@/domain/settings/units';

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

/** Unit of every `{{x, mass}}` in the copy (D-043): the profile's choice, kg by default. */
let massUnit: MassUnit = 'kg';

export function currentMassUnit(): MassUnit {
  return massUnit;
}

/** Applies the user's unit; mounted screens are rendered again with it. */
export function setMassUnit(unit: MassUnit) {
  if (unit === massUnit) return;
  massUnit = unit;
  // Same language: react-i18next re-renders every translated component.
  // eslint-disable-next-line import/no-named-as-default-member
  if (i18n.isInitialized) void i18n.changeLanguage(i18n.language);
}

i18n.services.formatter?.add('mass', (value, lng) => formatMass(value, lng === 'en' ? 'en' : 'fr', massUnit));

export default i18n;
