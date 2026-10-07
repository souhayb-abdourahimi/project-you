import { router } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  Icon,
  IconButton,
  LoadingScreen,
  MetricCard,
  Screen,
  ScreenHeader,
  Section,
  Text,
} from '@/components/ui';
import { MILESTONES } from '@/domain/journey/milestones';
import type { DayMode } from '@/domain/journey/outcomes';
import { renderMessage } from '@/domain/journey/voice/composer';
import { fromKg } from '@/domain/settings/units';
import { daysBetween } from '@/domain/shared/dates';
import { HealthCard } from '@/features/health/HealthCard';
import { useActivitySummary } from '@/features/health/useActivitySummary';
import { CoachCard } from '@/features/journey/CoachCard';
import { CoachQuestion } from '@/features/journey/CoachQuestion';
import { DailyItemRow } from '@/features/journey/DailyItemRow';
import { OffPlanOffer } from '@/features/journey/OffPlanOffer';
import { SafetyNotice } from '@/features/journey/SafetyNotice';
import { DayEnergyWarning } from '@/features/nutrition/DayEnergyWarning';
import { MealCard } from '@/features/nutrition/MealCard';
import { PlanDiagnosisCard } from '@/features/nutrition/PlanDiagnosisCard';
import { SyncNotice } from '@/features/settings/SyncNotice';
import { todaySnapshot, type SnapshotMetric } from '@/features/today/view';
import { useJourney, type Journey } from '@/hooks/useJourney';
import { useMassUnit } from '@/hooks/useMassUnit';
import { usePlan, type Plan } from '@/hooks/usePlan';
import { formatDate, formatNumber, nowTime } from '@/lib/format';
import { isSupabaseConfigured } from '@/services/supabase';
import { useDataStore } from '@/state/data';
import { useHealthStore } from '@/state/health';
import { useNotificationStore } from '@/state/notifications';
import { layout, spacing, useColors } from '@/theme';

/**
 * "Qu'est-ce que je dois faire aujourd'hui ?" — the Daily Coach (docs/DAILY_COACH.md §8). W-9 lays
 * it out around one priority: the coach of the day decides what leads (coachDay), this screen
 * only gives it the room. Safety first, then the hero, one coach question, a three-number glance,
 * the rest of the day, and what comes later.
 */
export default function TodayScreen() {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const plan = usePlan();
  const journey = useJourney(plan);
  const recordScreen = useNotificationStore((s) => s.recordScreen);
  const recordCoach = useNotificationStore((s) => s.recordCoach);
  const message = journey?.daily.message;
  const shownIds = journey?.coach.shownIds;
  const shownDate = journey?.coach.date;

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

  // Questions and follow-ups shown today are not repeated on the next days (W-7 §28).
  useEffect(() => {
    if (shownIds && shownDate && shownIds.length > 0) recordCoach(shownIds, shownDate);
  }, [shownIds, shownDate, recordCoach]);

  if (!plan || !journey) return <LoadingScreen />;
  const { daily, state, coach } = journey;
  const name = plan.snapshot.user.displayName;
  const meals = plan.mealPlan?.days.find((d) => d.date === plan.today) ?? null;
  const day = plan.schedule.days.find((d) => d.date === plan.today) ?? null;
  const organisation = day?.items.filter((i) => i.kind === 'meal_prep' || i.kind === 'shopping') ?? [];
  const voice = renderMessage(daily.message, (key, params) => t(key, params));
  const rest = daily.items.filter((i) => i.kind !== 'safety');

  return (
    <Screen airy>
      <View style={styles.block}>
        <ScreenHeader
          subtitle={formatDate(plan.today, i18n.language)}
          title={t(`daily.greeting.${daily.greeting}`, { name })}
          right={<IconButton icon="settings" label={t('settings.title')} onPress={() => router.push('/settings')} />}
        />
        {daily.greeting === 'welcome_back' ? <Text color="textSecondary">{t('daily.restart')}</Text> : null}
        <Text variant="captionStrong" color="primary">
          {t(daily.headline.key, daily.headline.params)}
        </Text>
      </View>

      {isSupabaseConfigured ? <SyncNotice /> : null}

      <View style={styles.stack}>
        <SafetyNotice state={state} />
        {/* The coach of the day decides what leads (W-7): a celebration waits under safety, a
            comeback or a proposal; one proposal at most, never under safety (D-037 §37). */}
        {coach.celebration ? <Celebration journey={journey} /> : null}
        {daily.mode !== 'normal' ? <Badge tone="primary" icon="info" label={t(`daily.mode.${daily.mode}`)} /> : null}
        {coach.question && coach.priority === 'difficulty' ? (
          <CoachQuestion question={coach.question} today={plan.today} />
        ) : null}
        <CoachCard coach={coach} items={daily.items} proposal={journey.proposal} today={plan.today} />
        {coach.question && coach.priority !== 'difficulty' ? (
          <CoachQuestion question={coach.question} today={plan.today} />
        ) : null}
        <OffPlanOffer coach={coach} />
      </View>

      <Snapshot plan={plan} journey={journey} />

      <Section title={t('daily.planTitle')}>
        <Card style={styles.list}>
          {rest.map((item, i) => (
            <View key={item.id} style={i > 0 ? [styles.divider, { borderTopColor: colors.border }] : null}>
              <DailyItemRow item={item} today={plan.today} />
            </View>
          ))}
          {organisation.map((item, i) =>
            item.kind === 'meal_prep' || item.kind === 'shopping' ? (
              <Text key={i} variant="caption" color="textMuted" style={styles.organisation}>
                {t(item.kind === 'meal_prep' ? 'today.mealPrep' : 'today.shopping', item)}
              </Text>
            ) : null,
          )}
        </Card>
        <QuickActions journey={journey} today={plan.today} />
      </Section>

      <HealthCard plan={plan} />

      {/* While the safety rule is active, the coach slows down instead of motivating (rule 8). */}
      {state.safety.active ? null : (
        <Card tone="subtle">
          <View style={styles.inline}>
            <Icon name="coach" size="sm" color="primary" />
            <Text variant="captionStrong" color="textSecondary">
              {t('today.motivation')}
            </Text>
          </View>
          <Text variant="headline">{voice.title}</Text>
          <Text color="textSecondary">{voice.body}</Text>
          {daily.anchor ? (
            <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
              <Text variant="caption" color="textMuted">
                {t('daily.startedBecause')}
              </Text>
              <Text variant="bodyMedium">« {daily.anchor.text} »</Text>
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

      {isSupabaseConfigured ? null : (
        <View style={styles.inline}>
          <Icon name="offline" size="sm" color="textMuted" />
          <Text variant="caption" color="textMuted" style={styles.flex}>
            {t('common.localMode')}
          </Text>
        </View>
      )}
    </Screen>
  );
}

/** Three numbers at most, all measured or entered (never estimated progress, CLAUDE.md rule 7). */
function Snapshot({ plan, journey }: { plan: Plan; journey: Journey }) {
  const { t, i18n } = useTranslation();
  const unit = useMassUnit();
  const health = useActivitySummary(plan);
  const stepsWanted = useHealthStore((s) => s.wanted.includes('steps'));
  const meals = plan.mealPlan?.days.find((d) => d.date === plan.today)?.meals ?? null;
  const metrics = todaySnapshot({
    week: journey.trainingWeek,
    meals,
    proteinTargetG: plan.targets.proteinG,
    stepsToday: stepsWanted ? (health?.stepsToday.today ?? null) : null,
    weightAvgKg: journey.progress.body.weight?.currentAvgKg ?? null,
    bodyOrder: journey.progress.bodyOrder,
  });
  if (metrics.length === 0) return null;
  const n = (v: number) => formatNumber(v, i18n.language);
  const card = (m: SnapshotMetric) => {
    switch (m.id) {
      case 'sessions':
        return (
          <MetricCard
            key={m.id}
            icon="sessions"
            iconColor="training"
            label={t('today.snapshot.sessions')}
            value={n(m.done)}
            unit={`/ ${n(m.planned)}`}
            caption={t('today.snapshot.sessionsCaption')}
            accessibilityLabel={t('today.snapshot.sessionsA11y', { done: m.done, planned: m.planned })}
          />
        );
      case 'protein':
        return (
          <MetricCard
            key={m.id}
            icon="protein"
            iconColor="nutrition"
            label={t('today.snapshot.protein')}
            value={n(m.eatenG)}
            unit={`/ ${n(m.targetG)} g`}
            caption={t('today.snapshot.proteinCaption')}
            accessibilityLabel={t('today.snapshot.proteinA11y', { eaten: m.eatenG, target: m.targetG })}
          />
        );
      case 'steps':
        return (
          <MetricCard
            key={m.id}
            icon="steps"
            iconColor="recovery"
            label={t('today.snapshot.steps')}
            value={n(m.steps)}
            caption={t('today.snapshot.stepsCaption')}
          />
        );
      case 'weight':
        return (
          <MetricCard
            key={m.id}
            icon="weight"
            iconColor="progress"
            label={t('today.snapshot.weight')}
            value={n(fromKg(m.kg, unit))}
            unit={unit}
            caption={t('today.snapshot.weightCaption')}
          />
        );
    }
  };
  return (
    <View style={styles.snapshot} accessibilityLabel={t('today.snapshot.title')}>
      {metrics.map(card)}
    </View>
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
    <Card tone="subtle">
      <Text variant="bodyMedium">{t('daily.actions.title')}</Text>
      <View style={styles.actions}>
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
      </View>
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
    <Card tone="positive" dense>
      <View style={styles.inline}>
        <Icon name="celebrate" size="md" color="success" />
        <Text variant="headline" accessibilityRole="header" style={styles.flex}>
          {daily.message.templateId.startsWith('milestone_reached|') ? title : t('daily.celebration.title')}
        </Text>
      </View>
      <View style={styles.actions}>
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
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm },
  stack: { gap: layout.stackGap },
  snapshot: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  list: { paddingVertical: spacing.xs, gap: 0 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  organisation: { paddingVertical: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
