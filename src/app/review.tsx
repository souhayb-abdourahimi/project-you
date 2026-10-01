import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Banner, Button, Card, EmptyState, Row, Screen, StatTile, Text } from '@/components/ui';
import { personalRecords } from '@/domain/journey/progress-facts';
import { checkinWeek } from '@/domain/journey/weekly-checkin';
import { weeklyReview, type ReviewPoint } from '@/domain/progress/weekly-review';
import { scheduleOfWeek, usePlan } from '@/hooks/usePlan';
import { addDays } from '@/domain/shared/dates';
import { formatMoney } from '@/lib/format';
import { useWeights } from '@/hooks/useWeights';
import { useDataStore } from '@/state/data';

function Points({ title, points }: { title: string; points: ReviewPoint[] }) {
  const { t } = useTranslation();
  return (
    <Card>
      <Text variant="heading">{title}</Text>
      {points.length === 0 ? <Text color="textMuted">{t('review.none')}</Text> : null}
      {points.map((p) => (
        <Text key={p.key}>• {t(p.key, p.params)}</Text>
      ))}
    </Card>
  );
}

export default function ReviewScreen() {
  const { t, i18n } = useTranslation();
  const plan = usePlan();
  const data = useDataStore();
  const weights = useWeights();
  if (!plan) return <EmptyState message={t('review.noProfile')} />;

  // Friday to Sunday: this week; Monday and Tuesday: the week that just ended (with its check-in).
  const openWeek = checkinWeek(plan.today);
  const weekStart = openWeek ?? plan.weekStart;
  const current = weekStart === plan.weekStart;
  const checkin = data.weeklyCheckins.find((c) => c.weekStart === weekStart);
  const r = weeklyReview({
    weekStart,
    today: current ? plan.today : addDays(weekStart, 6),
    goal: plan.snapshot.goal.type,
    schedule: current ? plan.schedule : scheduleOfWeek(plan.snapshot, weekStart, data.rescheduled),
    completedSessions: data.completedSessions,
    setLogs: data.setLogs,
    mealPlan: current ? plan.mealPlan : data.previousMealPlan,
    checkin: checkin ?? (openWeek ? null : undefined),
    sessionOutcomes: data.sessionOutcomes,
    dayLogs: data.dayLogs,
    records: personalRecords(data),
    weights,
    waist: data.waist,
    expenses: data.expenses,
    weeklyBudgetCents: plan.snapshot.budget.weeklyFoodBudgetCents,
  });

  return (
    <Screen>
      <Text color="textMuted">{t('review.intro')}</Text>
      {openWeek && !checkin ? <Button label={t('review.checkinCta')} onPress={() => router.push('/checkin')} /> : null}
      {checkin ? <Banner tone="success" message={t('review.checkinDone')} /> : null}
      <Row>
        <StatTile
          label={t('review.sessions')}
          value={t('review.sessionsValue', { done: r.sessions.done, planned: r.sessions.planned })}
        />
        <StatTile
          label={t('review.meals')}
          value={r.meals ? `${r.meals.eaten} / ${r.meals.planned}` : t('common.unavailable')}
        />
        <StatTile
          label={t('review.weight')}
          value={r.weight.averageKg === null ? t('common.unavailable') : t('common.kg', { value: r.weight.averageKg })}
        />
        <StatTile
          label={t('review.budget')}
          value={
            r.budget
              ? `${formatMoney(r.budget.spentCents, i18n.language)} / ${formatMoney(r.budget.plannedCents, i18n.language)}`
              : t('common.unavailable')
          }
        />
        <StatTile
          label={t('review.effort')}
          value={r.averageRpe === null ? t('common.unavailable') : String(r.averageRpe)}
        />
      </Row>
      <Points title={t('review.workedTitle')} points={r.worked} />
      <Points title={t('review.hardTitle')} points={r.hard} />
      <Points title={t('review.adaptTitle')} points={r.adapt} />
      <Points title={t('review.nextTitle')} points={r.nextWeek} />
      {r.missing.length > 0 ? <Points title={t('review.missingTitle')} points={r.missing} /> : null}
    </Screen>
  );
}
