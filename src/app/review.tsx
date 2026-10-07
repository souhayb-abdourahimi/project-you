import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { StyleSheet, View } from 'react-native';

import {
  Banner,
  Button,
  Card,
  EmptyState,
  HeroCard,
  Icon,
  MetricCard,
  Screen,
  Text,
  type IconName,
} from '@/components/ui';
import { personalRecords } from '@/domain/journey/progress-facts';
import { checkinWeek } from '@/domain/journey/weekly-checkin';
import { weeklyReview, type ReviewPoint } from '@/domain/progress/weekly-review';
import { Recommendations } from '@/features/journey/Recommendations';
import { useJourney } from '@/hooks/useJourney';
import { scheduleOfWeek, usePlan } from '@/hooks/usePlan';
import { addDays } from '@/domain/shared/dates';
import { weekPrescriptionKnown } from '@/domain/training/compare';
import { sessionContexts } from '@/domain/training/session-context';
import { plannedSessionDates } from '@/domain/training/week-view';
import { formatDate, formatMoney } from '@/lib/format';
import { useWeights } from '@/hooks/useWeights';
import { useDataStore } from '@/state/data';
import { radius, spacing, useColors, type ColorToken } from '@/theme';

/** A part of the review: an icon, a title, its points as facts. Nothing to say is said plainly. */
function Points({
  title,
  points,
  icon,
  color,
}: {
  title: string;
  points: ReviewPoint[];
  icon: IconName;
  color: ColorToken;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  return (
    <Card style={styles.points}>
      <View style={styles.inline}>
        <Icon name={icon} size="md" color={color} />
        <Text variant="title3" style={styles.flex}>
          {title}
        </Text>
      </View>
      {points.length === 0 ? <Text color="textMuted">{t('review.none')}</Text> : null}
      {points.map((p) => (
        <View key={p.key} style={styles.point}>
          <View style={[styles.dot, { backgroundColor: colors[color] }]} />
          <Text style={styles.flex}>{t(p.key, p.params)}</Text>
        </View>
      ))}
    </Card>
  );
}

/** A number of the week; a missing one says "Donnée indisponible" in words, never a big dash alone. */
function Tile({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string | null;
  icon: IconName;
  color: ColorToken;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.tile}>
      <MetricCard
        icon={icon}
        iconColor={color}
        label={label}
        value={value ?? '—'}
        caption={value === null ? t('common.unavailable') : undefined}
        accessibilityLabel={`${label}, ${value ?? t('common.unavailable')}`}
      />
    </View>
  );
}

export default function ReviewScreen() {
  const { t, i18n } = useTranslation();
  const plan = usePlan();
  const data = useDataStore();
  const weights = useWeights();
  const journey = useJourney(plan);
  if (!plan) return <EmptyState message={t('review.noProfile')} />;

  // Friday to Sunday: this week; Monday and Tuesday: the week that just ended (with its check-in).
  const openWeek = checkinWeek(plan.today);
  const weekStart = openWeek ?? plan.weekStart;
  const current = weekStart === plan.weekStart;
  const checkin = data.weeklyCheckins.find((c) => c.weekStart === weekStart);
  const schedule = current ? plan.schedule : scheduleOfWeek(plan.snapshot, weekStart, data.rescheduled);
  const r = weeklyReview({
    weekStart,
    today: current ? plan.today : addDays(weekStart, 6),
    goal: plan.snapshot.goal.type,
    schedule,
    // The past week as it was prescribed (W-6, D-038), not rebuilt from today's profile; without
    // any stored prescription its plan is unknown (W-7.1).
    prescriptionUnknown: !current && !weekPrescriptionKnown(data, weekStart),
    plannedSessionDates: plannedSessionDates({
      records: data,
      facts: data,
      today: plan.today,
      weeks: [{ weekStart, schedule: schedule.days }],
    }),
    completedSessions: data.completedSessions,
    setLogs: data.setLogs,
    mealPlan: current ? plan.mealPlan : data.previousMealPlan,
    checkin: checkin ?? (openWeek ? null : undefined),
    sessionOutcomes: data.sessionOutcomes,
    dayLogs: data.dayLogs,
    records: personalRecords({ ...data, sessionContexts: sessionContexts(data) }),
    weights,
    waist: data.waist,
    expenses: data.expenses,
    weeklyBudgetCents: plan.snapshot.budget.weeklyFoodBudgetCents,
  });

  return (
    <Screen airy>
      <HeroCard
        tone="accent"
        icon="checkin"
        overline={t('review.overline')}
        title={t('review.weekOf', { date: formatDate(weekStart, i18n.language) })}
        titleVariant="title2">
        <Text color="textSecondary">{t('review.intro')}</Text>
        {openWeek && !checkin ? (
          <Button label={t('review.checkinCta')} onPress={() => router.push('/checkin')} />
        ) : null}
      </HeroCard>
      {checkin ? <Banner tone="success" message={t('review.checkinDone')} /> : null}
      <View style={styles.tiles}>
        <Tile
          icon="sessions"
          color="training"
          label={t('review.sessions')}
          value={
            r.sessions.prescriptionUnknown
              ? t('review.sessionsDone', { done: r.sessions.done })
              : t('review.sessionsValue', { done: r.sessions.done, planned: r.sessions.planned })
          }
        />
        <Tile
          icon="meal"
          color="nutrition"
          label={t('review.meals')}
          value={r.meals ? `${r.meals.eaten} / ${r.meals.planned}` : null}
        />
        <Tile
          icon="weight"
          color="progress"
          label={t('review.weight')}
          value={r.weight.averageKg === null ? null : t('common.mass', { value: r.weight.averageKg })}
        />
        <Tile
          icon="bolt"
          color="recovery"
          label={t('review.effort')}
          value={r.averageRpe === null ? null : String(r.averageRpe)}
        />
        <Tile
          icon="shopping"
          color="textSecondary"
          label={t('review.budget')}
          value={
            r.budget
              ? `${formatMoney(r.budget.spentCents, i18n.language)} / ${formatMoney(r.budget.plannedCents, i18n.language)}`
              : null
          }
        />
      </View>
      <Points icon="done" color="success" title={t('review.workedTitle')} points={r.worked} />
      <Points icon="info" color="textSecondary" title={t('review.hardTitle')} points={r.hard} />
      <Points icon="sync" color="primary" title={t('review.adaptTitle')} points={r.adapt} />
      {/* The Adaptation Engine's proposals for the coming week, with their data (§8). */}
      {journey ? <Recommendations recommendations={journey.recommendations} today={plan.today} /> : null}
      <Points icon="arrow" color="primary" title={t('review.nextTitle')} points={r.nextWeek} />
      {r.missing.length > 0 ? (
        <Points icon="info" color="textMuted" title={t('review.missingTitle')} points={r.missing} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { flexGrow: 1, flexBasis: '45%', minWidth: 140 },
  points: { gap: spacing.md },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  dot: { width: spacing.sm, height: spacing.sm, borderRadius: radius.pill, marginTop: spacing.sm },
  flex: { flex: 1 },
});
