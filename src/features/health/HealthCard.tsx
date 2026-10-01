import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button, Card, Row, StatTile, Text } from '@/components/ui';
import type { Plan } from '@/hooks/usePlan';
import { useHealthStore } from '@/state/health';

import { useActivitySummary } from './useActivitySummary';

const number = (value: number | null, locale: string) => (value === null ? '—' : value.toLocaleString(locale));

/** Compact activity card on Today, only once Apple Health / Health Connect is linked. */
export function HealthCard({ plan }: { plan: Plan | null }) {
  const { t, i18n } = useTranslation();
  const summary = useActivitySummary(plan);
  const wanted = useHealthStore((s) => s.wanted);
  if (!summary) return null;
  const { stepsToday: steps, extraWorkouts, latestWeight } = summary;
  const lastWorkout = extraWorkouts[0];

  return (
    <Card>
      <Row>
        <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
          {t('health.card.title')}
        </Text>
        <Button compact variant="ghost" label={t('health.card.manage')} onPress={() => router.push('/health')} />
      </Row>
      {wanted.includes('steps') ? (
        <Row>
          <StatTile label={t('health.card.stepsToday')} value={number(steps.today, i18n.language)} />
          <StatTile label={t('health.card.stepsWeek')} value={number(steps.week, i18n.language)} />
          <StatTile
            label={t('health.card.trend')}
            value={steps.trend ? t(`health.trend.${steps.trend}`) : '—'}
            hint={steps.trend ? undefined : t('health.card.trendPending')}
          />
        </Row>
      ) : null}
      {/* Active energy is the device's estimate: never shown as a measured value (CLAUDE.md rule 7). */}
      {wanted.includes('workouts') && lastWorkout ? (
        <Text color="textMuted">
          {t('health.card.otherWorkout', {
            kind: t(`health.kind.${lastWorkout.kind}`),
            minutes: lastWorkout.durationMin,
          })}
        </Text>
      ) : null}
      {wanted.includes('weight') && latestWeight ? (
        <Text color="textMuted">{t('health.card.weight', { value: latestWeight.weightKg })}</Text>
      ) : null}
    </Card>
  );
}
