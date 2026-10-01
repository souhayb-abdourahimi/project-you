import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Banner, Button, Card, Row, Screen, Section, Text } from '@/components/ui';
import { dailyMotivation } from '@/domain/motivation/messages';
import { nextAction } from '@/domain/today';
import { HealthCard } from '@/features/health/HealthCard';
import { DayEnergyWarning } from '@/features/nutrition/DayEnergyWarning';
import { MealCard } from '@/features/nutrition/MealCard';
import { PlanDiagnosisCard } from '@/features/nutrition/PlanDiagnosisCard';
import { usePlan } from '@/hooks/usePlan';
import { useWeights } from '@/hooks/useWeights';
import { nowTime } from '@/lib/format';
import { isSupabaseConfigured } from '@/services/supabase';
import { useDataStore } from '@/state/data';

export default function TodayScreen() {
  const { t } = useTranslation();
  const plan = usePlan();
  const completed = useDataStore((s) => s.completedSessions);
  const weights = useWeights();
  if (!plan) return null;

  const day = plan.schedule.days.find((d) => d.date === plan.today) ?? null;
  const meals = plan.mealPlan?.days.find((d) => d.date === plan.today) ?? null;
  const workout = day?.items.find((i) => i.kind === 'workout');
  const workoutDone = completed.some((c) => c.date === plan.today);
  const action = nextAction({
    day,
    meals,
    workoutDone,
    weightLoggedThisWeek: weights.some((w) => w.date >= plan.weekStart),
    now: nowTime(),
  });
  const motivation = dailyMotivation(plan.snapshot.motivation, plan.today);
  const focus = workout?.kind === 'workout' ? plan.workoutPlan.sessions[workout.sessionIndex]?.focus : undefined;

  const primary = () => {
    if (action.kind === 'start_workout') router.push(`/workout/${plan.today}`);
    else if (action.kind === 'log_weight') router.push('/progress');
    else if (action.kind === 'eat_meal') router.push('/nutrition');
  };

  return (
    <Screen>
      <Row>
        <Text variant="display" style={{ flex: 1 }}>
          {t('today.greeting', { name: plan.snapshot.user.displayName })}
        </Text>
        <Button compact variant="ghost" label={t('settings.title')} onPress={() => router.push('/settings')} />
      </Row>
      {!isSupabaseConfigured ? <Banner message={t('common.localMode')} /> : null}

      <Card>
        <Text variant="caption" color="textMuted">
          {t('today.nextAction')}
        </Text>
        <Text variant="title">
          {action.kind === 'start_workout'
            ? t('today.startWorkout', { focus: focus ? t(`enums.focus.${focus}`) : '' })
            : action.kind === 'eat_meal'
              ? t('today.eatMeal', {
                  slot: t(`enums.slot.${meals?.meals.find((m) => m.id === action.mealId)?.slot ?? 'lunch'}`),
                })
              : action.kind === 'log_weight'
                ? t('today.logWeight')
                : t('today.rest')}
        </Text>
        {action.kind === 'start_workout' && action.start && workout?.kind === 'workout' ? (
          <Text color="textMuted">
            {t('today.workoutAt', { time: action.start, location: t(`enums.location.${workout.location}`) })}
          </Text>
        ) : null}
        {action.kind !== 'rest' ? <Button label={t('common.start')} onPress={primary} /> : null}
        {workout && !workoutDone ? (
          <Row>
            <Button
              compact
              variant="secondary"
              label={t('today.noTime')}
              onPress={() => router.push({ pathname: '/adapt', params: { mode: 'time' } })}
            />
            <Button
              compact
              variant="secondary"
              label={t('today.noMotivation')}
              onPress={() => router.push({ pathname: '/adapt', params: { mode: 'motivation' } })}
            />
          </Row>
        ) : null}
      </Card>

      <HealthCard plan={plan} />

      <Card muted>
        <Text variant="caption" color="textMuted">
          {t('today.motivation')}
        </Text>
        <Text>{t(motivation.key, motivation.params)}</Text>
      </Card>

      {day?.items.some((i) => i.kind !== 'workout') ? (
        <Section title={t('today.plan')}>
          {day.items.map((item, i) => {
            if (item.kind === 'meal_prep') return <Text key={i}>{t('today.mealPrep', item)}</Text>;
            if (item.kind === 'shopping') return <Text key={i}>{t('today.shopping', item)}</Text>;
            if (item.kind === 'rest') return <Text key={i}>{t('program.rest')}</Text>;
            return null;
          })}
        </Section>
      ) : null}

      <Section title={t('today.meals')}>
        <DayEnergyWarning day={meals} />
        {plan.mealPlan?.diagnosis ? <PlanDiagnosisCard diagnosis={plan.mealPlan.diagnosis} compact /> : null}
        {meals?.meals.map((m) => (
          <MealCard key={m.id} meal={m} compact />
        ))}
      </Section>
    </Screen>
  );
}
