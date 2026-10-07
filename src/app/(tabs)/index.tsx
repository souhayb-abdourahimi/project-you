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
  CoachNote,
  Screen,
  ScreenHeader,
  Section,
  Text,
} from '@/components/ui';
import { MILESTONES } from '@/domain/journey/milestones';
import type { DayMode } from '@/domain/journey/outcomes';
import { renderMessage } from '@/domain/journey/voice/composer';
import { daysBetween } from '@/domain/shared/dates';
import { HealthCard } from '@/features/health/HealthCard';
import { CoachCard } from '@/features/journey/CoachCard';
import { CoachQuestion } from '@/features/journey/CoachQuestion';
import { DailyItemRow } from '@/features/journey/DailyItemRow';
import { OffPlanOffer } from '@/features/journey/OffPlanOffer';
import { SafetyNotice } from '@/features/journey/SafetyNotice';
import { DayEnergyWarning } from '@/features/nutrition/DayEnergyWarning';
import { MealCard } from '@/features/nutrition/MealCard';
import { PlanDiagnosisCard } from '@/features/nutrition/PlanDiagnosisCard';
import { SyncNotice } from '@/features/settings/SyncNotice';
import { TodayGlance } from '@/features/today/TodayGlance';
import { useJourney, type Journey } from '@/hooks/useJourney';
import { usePlan } from '@/hooks/usePlan';
import { formatDate, nowTime } from '@/lib/format';
import { isSupabaseConfigured } from '@/services/supabase';
import { useDataStore } from '@/state/data';
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
  // The celebration card already shows the milestone's title: the coach note keeps only its words.
  const celebrated = coach.celebration && daily.message.templateId.startsWith('milestone_reached|');
  // While the safety rule is active, the coach slows down instead of motivating (rule 8).
  const motivation = state.safety.active ? null : (
    <CoachNote label={t('today.motivation')} title={celebrated ? undefined : voice.title} message={voice.body}>
      {daily.anchor ? (
        <View style={styles.anchor}>
          <Text variant="caption" color="textMuted">
            {t('daily.startedBecause')}
          </Text>
          <Text variant="bodyMedium">« {daily.anchor.text} »</Text>
        </View>
      ) : null}
    </CoachNote>
  );

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

      {/* Image, then data, then one word from the coach: its question, else the message of the day. */}
      <TodayGlance plan={plan} journey={journey} />
      {coach.question ? null : motivation}

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

      {coach.question ? motivation : null}

      <HealthCard plan={plan} />

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
  anchor: { gap: spacing.xs, marginTop: spacing.xs },
  list: { paddingVertical: spacing.xs, gap: 0 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  organisation: { paddingVertical: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
