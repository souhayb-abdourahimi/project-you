import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button, Card, Section } from '@/components/ui';
import type { WeekComparison } from '@/domain/training/compare';

import { WeekFacts } from './WeekFacts';

/** Progress Journey (W-6): this week's training, planned vs done, and the way to the history. */
export function TrainingWeekCard({ week }: { week: WeekComparison }) {
  const { t } = useTranslation();
  const { sessions: _s, weekStart: _w, ...totals } = week;
  if (totals.planned === 0 && totals.extra === 0) return null;
  return (
    <Section title={t('history.thisWeek')}>
      <Card>
        <WeekFacts totals={totals} current />
        <Button compact variant="secondary" label={t('history.open')} onPress={() => router.push('/history')} />
      </Card>
    </Section>
  );
}
