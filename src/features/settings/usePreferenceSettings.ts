import type { MassUnit } from '@/domain/settings/units';
import { weightUnitOf, type UserContextSnapshot } from '@/domain/profile/schemas';
import { deviceLocale } from '@/i18n';
import { useDeviceSettings, type LanguageChoice } from '@/state/device';
import { useProfileStore } from '@/state/profile';

/**
 * The display preferences (D-043), saved at once (one tap, nothing recalculated):
 * - language: this device's (system by default); the account keeps the last chosen language;
 * - mass unit: the account's (kg or lb), display and typing only;
 * - coach tone: the account's (gentle / direct), read by the journey's voice.
 */
export function usePreferenceSettings() {
  const snapshot = useProfileStore((s) => s.snapshot);
  const language = useDeviceSettings((s) => s.language);

  const savePreferences = (patch: Partial<UserContextSnapshot['preferences']>) => {
    const current = useProfileStore.getState().snapshot;
    if (!current) return;
    useProfileStore.getState().setSnapshot({ ...current, preferences: { ...current.preferences, ...patch } });
  };

  return {
    language,
    unit: weightUnitOf(snapshot),
    tone: snapshot?.preferences.motivationStyle ?? 'gentle',
    setLanguage: (choice: LanguageChoice) => {
      useDeviceSettings.getState().setLanguage(choice);
      savePreferences({ locale: choice === 'system' ? deviceLocale() : choice });
    },
    setUnit: (weightUnit: MassUnit) => savePreferences({ weightUnit }),
    setTone: (motivationStyle: 'gentle' | 'direct') => savePreferences({ motivationStyle }),
  };
}
