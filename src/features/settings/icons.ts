import type { IconName } from '@/components/ui';
import type { SettingsSection } from '@/domain/settings/sections';

/** One icon per settings section, the same in Profil and in Réglages. */
export const SECTION_ICON = {
  profile: 'profile',
  goal: 'progress',
  motivation: 'coach',
  training: 'workout',
  schedule: 'program',
  nutrition: 'nutrition',
} as const satisfies Record<SettingsSection, IconName>;
