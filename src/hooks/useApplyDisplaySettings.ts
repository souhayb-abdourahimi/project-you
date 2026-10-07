import { useEffect } from 'react';

import { weightUnitOf } from '@/domain/profile/schemas';
import i18n, { deviceLocale, setMassUnit } from '@/i18n';
import { useDeviceSettings } from '@/state/device';
import { useProfileStore } from '@/state/profile';

/**
 * Applies the display settings (D-043): the screen language of this device (system by default)
 * and the mass unit of the profile, used by every `{{x, mass}}` of the copy.
 */
export function useApplyDisplaySettings() {
  const language = useDeviceSettings((s) => s.language);
  const unit = useProfileStore((s) => weightUnitOf(s.snapshot));
  useEffect(() => {
    const next = language === 'system' ? deviceLocale() : language;
    if (i18n.language !== next) void i18n.changeLanguage(next);
  }, [language]);
  useEffect(() => setMassUnit(unit), [unit]);
}
