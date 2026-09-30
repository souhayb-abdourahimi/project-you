import { useTranslation } from 'react-i18next';

import { Card, EmptyState, Row, Screen, StatTile, Text } from '@/components/ui';
import { weeklyReview, type ReviewPoint } from '@/domain/progress/weekly-review';
import { usePlan } from '@/hooks/usePlan';
import { formatMoney } from '@/lib/format';
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
  if (!plan) return <EmptyState message={t('review.noProfile')} />;

  const r = weeklyReview({
    weekStart: plan.weekStart,
    today: plan.today,
    goal: plan.snapshot.goal.type,
    schedule: plan.schedule,
    completedSessions: data.completedSessions,
    setLogs: data.setLogs,
    mealPlan: plan.mealPlan,
    weights: data.weights,
    waist: data.waist,
    expenses: data.expenses,
    weeklyBudgetCents: plan.snapshot.budget.weeklyFoodBudgetCents,
  });

  return (
    <Screen>
      <Text color="textMuted">{t('review.intro')}</Text>
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
    </Screen>
  );
}
