import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Banner, Button, Card, EmptyState, Row, Screen, Section, StatTile, Text } from '@/components/ui';
import { weeklyStreak } from '@/domain/motivation/anti-abandon';
import { consistency, highlightedIndicators, weightTrend } from '@/domain/progress/weight';
import { addDays, startOfWeek } from '@/domain/shared/dates';
import { NumberField } from '@/features/onboarding/fields';
import { usePlan } from '@/hooks/usePlan';
import { useWeights } from '@/hooks/useWeights';
import { useDataStore } from '@/state/data';

export default function ProgressScreen() {
  const { t } = useTranslation();
  const plan = usePlan();
  const { waist, completedSessions, logWeight, logWaist } = useDataStore();
  const weights = useWeights();
  const [weight, setWeight] = useState<number | undefined>();
  const [waistCm, setWaistCm] = useState<number | undefined>();
  const [formKey, setFormKey] = useState(0);
  if (!plan) return null;

  const trend = weightTrend(weights);
  const goal = plan.snapshot.goal.type;
  const doneDates = completedSessions.map((c) => c.date);
  const plannedDates = plan.schedule.days
    .filter((d) => d.items.some((i) => i.kind === 'workout') && d.date <= plan.today)
    .map((d) => d.date);
  const regularity = consistency([...new Set([...plannedDates, ...doneDates])], doneDates, plan.today);
  const weeks = Array.from({ length: 12 }, (_, i) => addDays(plan.weekStart, -7 * (11 - i)));
  const streak = weeklyStreak(weeks.map((w) => doneDates.some((d) => startOfWeek(d) === w)));
  const latestWaist = [...waist].sort((a, b) => a.date.localeCompare(b.date)).at(-1);

  return (
    <Screen>
      <Text variant="display">{t('progress.title')}</Text>
      {goal === 'recomposition' ? <Banner tone="primary" message={t('progress.recompositionHint')} /> : null}
      <Text variant="label" color="textMuted">
        {t('progress.indicators')} :{' '}
        {highlightedIndicators(goal)
          .map((i) => t(`progress.indicator.${i}`))
          .join(' · ')}
      </Text>
      <Row>
        <StatTile
          label={t('progress.average')}
          value={trend.currentAverageKg === null ? '—' : t('common.kg', { value: trend.currentAverageKg })}
        />
        <StatTile
          label={t('progress.weeklyChange')}
          value={
            trend.weeklyChangeKg === null
              ? '—'
              : t('common.kg', { value: trend.weeklyChangeKg > 0 ? `+${trend.weeklyChangeKg}` : trend.weeklyChangeKg })
          }
        />
        <StatTile label={t('progress.waist')} value={latestWaist ? String(latestWaist.cm) : '—'} />
        <StatTile
          label={t('progress.consistency')}
          value={regularity === null ? '—' : `${Math.round(regularity * 100)} %`}
        />
      </Row>
      <Text color="textMuted">{t('progress.streak', { count: streak })}</Text>
      <Button variant="secondary" label={t('review.open')} onPress={() => router.push('/review')} />
      {weights.length === 0 ? <EmptyState message={t('progress.noData')} /> : null}
      <Section title={t('progress.weight')}>
        <Card>
          <NumberField
            key={`w${formKey}`}
            label={t('onboarding.profile.body.weight')}
            value={weight}
            onChange={setWeight}
          />
          <Button
            label={t('progress.logWeight')}
            disabled={!weight || weight < 25 || weight > 400}
            onPress={() => {
              if (weight) logWeight(plan.today, weight);
              setWeight(undefined);
              setFormKey((k) => k + 1);
            }}
          />
          <NumberField key={`c${formKey}`} label={t('progress.waist')} value={waistCm} onChange={setWaistCm} />
          <Button
            variant="secondary"
            label={t('progress.logWaist')}
            disabled={!waistCm || waistCm < 10 || waistCm > 300}
            onPress={() => {
              if (waistCm) logWaist(plan.today, waistCm);
              setWaistCm(undefined);
              setFormKey((k) => k + 1);
            }}
          />
        </Card>
      </Section>
    </Screen>
  );
}
