import { router } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Banner, Button, Card, LoadingScreen, Row, Screen, Section, Text } from '@/components/ui';
import { MILESTONES } from '@/domain/journey/milestones';
import type { DayMode } from '@/domain/journey/outcomes';
import { renderMessage } from '@/domain/journey/voice/composer';
import { daysBetween } from '@/domain/shared/dates';
import { HealthCard } from '@/features/health/HealthCard';
import { DailyItemRow, itemLabel, useItemAction, WhyToggle } from '@/features/journey/DailyItemRow';
import { ProposalCard } from '@/features/journey/ProposalCard';
import { SafetyNotice } from '@/features/journey/SafetyNotice';
import { DayEnergyWarning } from '@/features/nutrition/DayEnergyWarning';
import { MealCard } from '@/features/nutrition/MealCard';
import { PlanDiagnosisCard } from '@/features/nutrition/PlanDiagnosisCard';
import { useJourney, type Journey } from '@/hooks/useJourney';
import { usePlan } from '@/hooks/usePlan';
import { nowTime } from '@/lib/format';
import { isSupabaseConfigured } from '@/services/supabase';
import { useDataStore } from '@/state/data';
import { useNotificationStore } from '@/state/notifications';
import { spacing } from '@/theme';

/** "Qu'est-ce que je dois faire aujourd'hui ?" — the Daily Coach (docs/DAILY_COACH.md §8). */
export default function TodayScreen() {
  const { t } = useTranslation();
  const plan = usePlan();
  const journey = useJourney(plan);
  const recordScreen = useNotificationStore((s) => s.recordScreen);
  const message = journey?.daily.message;

  // What the screen said joins the voice history shared with the notifications (anti-repetition).
  useEffect(() => {
    if (!message || !journey) return;
    recordScreen({
      templateId: message.templateId,
      anchorSlot: message.anchorSlot,
      date: journey.daily.date,
      time: nowTime(),
      channel: 'screen',
    });
  }, [message, journey, recordScreen]);

  if (!plan || !journey) return <LoadingScreen />;
  const { daily, state } = journey;
  const name = plan.snapshot.user.displayName;
  const meals = plan.mealPlan?.days.find((d) => d.date === plan.today) ?? null;
  const day = plan.schedule.days.find((d) => d.date === plan.today) ?? null;
  const organisation = day?.items.filter((i) => i.kind === 'meal_prep' || i.kind === 'shopping') ?? [];
  const coach = renderMessage(daily.message, (key, params) => t(key, params));

  return (
    <Screen>
      <Row>
        <Text variant="display" style={{ flex: 1 }} accessibilityRole="header">
          {t(`daily.greeting.${daily.greeting}`, { name })}
        </Text>
        <Button compact variant="ghost" label={t('settings.title')} onPress={() => router.push('/settings')} />
      </Row>
      {daily.greeting === 'welcome_back' ? <Text>{t('daily.restart')}</Text> : null}
      <Text variant="label" color="primary">
        {t(daily.headline.key, daily.headline.params)}
      </Text>
      {!isSupabaseConfigured ? <Banner message={t('common.localMode')} /> : null}
      <SafetyNotice state={state} />
      <Celebration journey={journey} />
      {/* One structural proposal at most per day, never under the safety rule (D-037 §37). */}
      {journey.proposal ? <ProposalCard recommendation={journey.proposal} today={plan.today} /> : null}

      <MainAction journey={journey} today={plan.today} />

      {daily.mode !== 'normal' ? <Banner tone="primary" message={t(`daily.mode.${daily.mode}`)} /> : null}
      {daily.adaptations.map((a) => (
        <Text key={a.key} variant="caption" color="textMuted">
          {t(a.key, a.params)}
        </Text>
      ))}

      <Section title={t('daily.planTitle')}>
        {daily.items
          .filter((i) => i.kind !== 'safety')
          .map((item) => (
            <DailyItemRow key={item.id} item={item} today={plan.today} />
          ))}
        {organisation.map((item, i) =>
          item.kind === 'meal_prep' || item.kind === 'shopping' ? (
            <Text key={i} color="textMuted">
              {t(item.kind === 'meal_prep' ? 'today.mealPrep' : 'today.shopping', item)}
            </Text>
          ) : null,
        )}
      </Section>

      <QuickActions journey={journey} today={plan.today} />

      <HealthCard plan={plan} />

      {/* While the safety rule is active, the coach slows down instead of motivating (rule 8). */}
      {state.safety.active ? null : (
        <Card muted>
          <Text variant="caption" color="textMuted">
            {t('today.motivation')}
          </Text>
          <Text variant="heading">{coach.title}</Text>
          <Text>{coach.body}</Text>
          {daily.anchor ? (
            <View style={{ gap: spacing.xs }}>
              <Text variant="caption" color="textMuted">
                {t('daily.startedBecause')}
              </Text>
              <Text>« {daily.anchor.text} »</Text>
            </View>
          ) : null}
        </Card>
      )}

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

function MainAction({ journey, today }: { journey: Journey; today: string }) {
  const { t } = useTranslation();
  const main = journey.daily.main;
  const action = useItemAction(
    main ?? { id: 'none', kind: 'safety', status: 'done', params: {}, reason: 'safety' },
    today,
  );
  return (
    <Card>
      <Text variant="caption" color="textMuted">
        {t('daily.mainTitle')}
      </Text>
      {main ? (
        <>
          <Text variant="title">{itemLabel(main, t)}</Text>
          {action ? <Button label={action.label} onPress={action.run} /> : null}
          <WhyToggle item={main} />
        </>
      ) : (
        <Text variant="title">{t('daily.allDone')}</Text>
      )}
    </Card>
  );
}

/**
 * "J'ai 15 minutes" and "Je n'ai pas envie" open the adapted options; "Journée difficile" lightens
 * the day in one tap. A smaller version of the day, never giving up, never guilt.
 */
function QuickActions({ journey, today }: { journey: Journey; today: string }) {
  const { t } = useTranslation();
  const logDay = useDataStore((s) => s.logDay);
  const { daily } = journey;
  const workoutToDo = daily.items.some((i) => i.kind === 'workout' && i.status === 'todo');
  if (!workoutToDo && daily.mode === 'normal') return null;
  const set = (mode: DayMode) => logDay(today, { mode });
  return (
    <Card>
      <Text variant="label">{t('daily.actions.title')}</Text>
      <Row>
        <Button
          compact
          variant="secondary"
          label={t('daily.actions.short')}
          onPress={() => router.push({ pathname: '/adapt', params: { mode: 'time' } })}
        />
        <Button
          compact
          variant="secondary"
          label={t('daily.actions.noMotivation')}
          onPress={() => router.push({ pathname: '/adapt', params: { mode: 'motivation' } })}
        />
        {daily.mode === 'difficult' ? null : (
          <Button compact variant="secondary" label={t('daily.actions.difficult')} onPress={() => set('difficult')} />
        )}
      </Row>
      {daily.mode !== 'normal' ? (
        <Button compact variant="ghost" label={t('daily.actions.normal')} onPress={() => set('normal')} />
      ) : null}
    </Card>
  );
}

function Celebration({ journey }: { journey: Journey }) {
  const { t } = useTranslation();
  const markCelebrated = useDataStore((s) => s.markCelebrated);
  const { celebration, daily } = journey;
  if (!celebration) return null;
  // One celebration covers every milestone still waiting (10 sessions is also step 2 of the path):
  // the next one is never queued right behind it.
  const sameDay = journey.progress.milestones
    .filter((m) => daysBetween(m.reachedOn, journey.daily.date) <= MILESTONES.celebrateWithinDays)
    .map((m) => m.id);
  // The coach message of the day already names the milestone with its real number.
  const { title } = renderMessage(daily.message, (key, params) => t(key, params));
  return (
    <Card>
      <Text variant="title" accessibilityRole="header">
        {daily.message.templateId.startsWith('milestone_reached|') ? title : t('daily.celebration.title')}
      </Text>
      <Row>
        <Button compact label={t('daily.celebration.seen')} onPress={() => markCelebrated(sameDay)} />
        <Button
          compact
          variant="secondary"
          label={t('daily.celebration.open')}
          onPress={() => {
            markCelebrated(sameDay);
            router.push('/progress');
          }}
        />
      </Row>
    </Card>
  );
}
