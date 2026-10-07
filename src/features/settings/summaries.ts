import type { TFunction } from 'i18next';

import type { UserContextSnapshot } from '@/domain/profile/schemas';
import type { SettingsSection } from '@/domain/settings/sections';

/** One line per section of the hub: the current values, so nothing important is hidden (D-043). */
export function sectionSummary(section: SettingsSection, s: UserContextSnapshot, t: TFunction, year: number): string {
  switch (section) {
    case 'profile':
      return t('settings.summary.profile', {
        name: s.user.displayName,
        age: year - s.user.birthYear,
        height: s.user.heightCm,
      });
    case 'goal':
      return t(`enums.goal.${s.goal.type}`);
    case 'motivation':
      return s.motivation.why?.trim() ? s.motivation.why.trim() : t('settings.summary.empty');
    case 'training':
      return t('settings.summary.training', {
        count: s.training.sessionsPerWeek,
        minutes: s.training.sessionMinutes,
        place: t(s.training.hasGym ? 'settings.summary.gym' : 'settings.summary.home'),
        level: t(`enums.level.${s.training.level}`),
      });
    case 'schedule':
      return s.schedule.availability.length > 0
        ? t('settings.summary.slots', { count: s.schedule.availability.length })
        : t('settings.summary.noSlots');
    case 'nutrition':
      return [
        t(`enums.diet.${s.nutrition.diet}`),
        s.nutrition.allergies.length > 0
          ? s.nutrition.allergies.map((a) => t(`enums.allergen.${a}`)).join(', ')
          : t('settings.summary.noAllergy'),
      ].join(' · ');
  }
}
