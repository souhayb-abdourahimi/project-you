import { useTranslation } from 'react-i18next';

import { Banner } from '@/components/ui';
import { appliedCalorieOffset, sessionsPerWeekDecision } from '@/domain/journey/adjustments';
import type { SettingsSection } from '@/domain/settings/sections';
import { formatDate } from '@/lib/format';
import { useDataStore } from '@/state/data';
import { useProfileStore } from '@/state/profile';

/**
 * Says when the program follows an accepted adaptation rather than the answer of the profile
 * (D-043 §24): "your answer: 4, your program: 3 since the adjustment of …". Changing the answer
 * replaces the adaptation (shown on the preview).
 */
export function DecisionNote({ section }: { section: SettingsSection }) {
  const { t, i18n } = useTranslation();
  const adjustments = useDataStore((s) => s.adjustments);
  const snapshot = useProfileStore((s) => s.snapshot);
  if (!snapshot) return null;
  if (section === 'training') {
    const decision = sessionsPerWeekDecision(adjustments);
    if (!decision || Number(decision.to) === snapshot.training.sessionsPerWeek) return null;
    return (
      <Banner
        tone="primary"
        message={t('settings.note.frequency', {
          count: Number(decision.to),
          answer: snapshot.training.sessionsPerWeek,
          date: formatDate(decision.effectiveFrom, i18n.language),
        })}
      />
    );
  }
  if (section === 'goal') {
    const offset = appliedCalorieOffset(adjustments);
    if (offset === 0) return null;
    return <Banner tone="primary" message={t('settings.note.calories', { offset })} />;
  }
  return null;
}
