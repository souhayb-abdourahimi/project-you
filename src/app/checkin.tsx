import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  Banner,
  Button,
  Card,
  ChoiceGroup,
  EmptyState,
  FeelingScale,
  Icon,
  MetricCard,
  Screen,
  ScreenHeader,
  Section,
  Text,
  type FeelingStep,
} from '@/components/ui';
import {
  asksBody,
  checkinWeek,
  MAIN_PROBLEMS,
  type MainProblem,
  type WeeklyCheckin,
} from '@/domain/journey/weekly-checkin';
import { MassField, NumberField } from '@/features/onboarding/fields';
import { checkinOverview } from '@/features/checkin/view';
import { WeekGlance } from '@/features/today/TodayGlance';
import { weekStrip } from '@/features/today/view';
import { useJourney } from '@/hooks/useJourney';
import { usePlan } from '@/hooks/usePlan';
import { formatWeekRange } from '@/lib/format';
import { useWeights } from '@/hooks/useWeights';
import { useDataStore } from '@/state/data';
import { radius, spacing, useColors } from '@/theme';

const LEVELS = [1, 2, 3, 4, 5] as const;
type Level = (typeof LEVELS)[number];
const QUESTIONS = ['energy', 'motivation', 'fatigue', 'nutrition', 'training', 'difficulty'] as const;
type Question = (typeof QUESTIONS)[number];

/**
 * Weekly check-in: calm, quick and factual. The data rules are unchanged: only the weekly rating
 * is required, body measures are asked only when relevant, and optional answers stay optional.
 */
export default function CheckinScreen() {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const plan = usePlan();
  const journey = useJourney(plan);
  const weights = useWeights();
  const { waist, measurements, weeklyCheckins, saveWeeklyCheckin, logWeight, logWaist } = useDataStore();
  const [rating, setRating] = useState<Level | null>(null);
  const [answers, setAnswers] = useState<Partial<Record<Question, Level>>>({});
  const [problem, setProblem] = useState<MainProblem | null>(null);
  const [weight, setWeight] = useState<number | undefined>();
  const [waistCm, setWaistCm] = useState<number | undefined>();

  if (!plan) return <EmptyState message={t('review.noProfile')} />;

  const week = checkinWeek(plan.today);
  if (!week) return <EmptyState message={t('checkin.closed')} />;

  const already = weeklyCheckins.find((checkin) => checkin.weekStart === week);
  const overview = journey
    ? checkinOverview({
        checkinWeek: week,
        currentWeek: plan.weekStart,
        today: plan.today,
        week: weekStrip(journey.trainingWeek, plan.today),
        mealDays: plan.mealPlan?.days ?? null,
      })
    : null;
  const last = (dates: string[]) => dates.sort().at(-1) ?? null;
  const body = asksBody(
    plan.today,
    last(weights.map((entry) => entry.date)),
    last([...waist.map((entry) => entry.date), ...measurements.map((entry) => entry.date)]),
  );

  // Out of range: said under the field (after typing), never dropped without a word.
  const weightOk = weight !== undefined && weight >= 25 && weight <= 400;
  const waistOk = waistCm !== undefined && waistCm >= 10 && waistCm <= 300;
  const save = () => {
    if (!rating) return;
    const checkin: WeeklyCheckin = {
      weekStart: week,
      weekRating: rating,
      ...answers,
      ...(problem ? { mainProblem: problem } : {}),
      answeredAt: new Date().toISOString(),
    };
    saveWeeklyCheckin(checkin);
    if (body.weight && weightOk) logWeight(plan.today, weight);
    if (body.measurements && waistOk) logWaist(plan.today, waistCm);
    router.replace('/review');
  };

  const levels = (label: string, value: Level | undefined | null, set: (level: Level) => void) => (
    <ChoiceGroup
      single
      label={label}
      options={LEVELS.map((level) => ({ value: level, label: String(level) }))}
      selected={value ? [value] : []}
      onToggle={set}
    />
  );

  return (
    <Screen airy>
      <View style={styles.intro}>
        <ScreenHeader title={t('checkin.title')} subtitle={formatWeekRange(week, i18n.language)} />
        <Text variant="caption" color="textSecondary">
          {t('checkin.intro')}
        </Text>
      </View>

      {already ? <Banner tone="success" message={t('checkin.already')} /> : null}

      {overview ? (
        <View style={styles.overview}>
          {overview.week ? <WeekGlance week={overview.week} /> : null}
          <View style={styles.tiles}>
            {overview.week ? (
              <MetricCard
                icon="workout"
                iconColor="training"
                label={t('checkin.overview.sessions')}
                value={`${overview.week.done} / ${overview.week.planned}`}
              />
            ) : null}
            {overview.meals ? (
              <MetricCard
                icon="meal"
                iconColor="nutrition"
                label={t('checkin.overview.meals')}
                value={`${overview.meals.eaten} / ${overview.meals.planned}`}
              />
            ) : null}
          </View>
        </View>
      ) : null}

      <Card raised style={styles.ratingCard}>
        <Text variant="headline">{t('checkin.weekRating')}</Text>
        <FeelingScale
          label={t('checkin.weekRating')}
          options={([5, 4, 3, 2, 1] as const).map((level, i) => ({
            value: level,
            label: t(`checkin.mood.${level}`),
            step: (i + 1) as FeelingStep,
          }))}
          value={rating}
          onChange={setRating}
        />
      </Card>

      <Section title={t('checkin.details')}>
        <Card style={styles.questions}>
          {QUESTIONS.map((question, i) => (
            <View
              key={question}
              style={[
                styles.question,
                i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
              ]}>
              <View style={styles.questionTop}>
                <Text variant="headline">{t(`checkin.question.${question}`)}</Text>
                <Text variant="caption" color="textMuted">
                  {t(`checkin.hint.${question}`)}
                </Text>
              </View>
              {levels(t(`checkin.question.${question}`), answers[question], (level) =>
                setAnswers((current) => ({
                  ...current,
                  [question]: current[question] === level ? undefined : level,
                })),
              )}
            </View>
          ))}
        </Card>
      </Section>

      <Card style={styles.card}>
        <View style={styles.sectionHeading}>
          <View style={[styles.iconWell, { backgroundColor: colors.surfaceSubtle }]}>
            <Icon name="info" size="md" color="textSecondary" />
          </View>
          <View style={styles.flex}>
            <Text variant="title3">{t('checkin.problemTitle')}</Text>
          </View>
        </View>
        <ChoiceGroup
          single
          label={t('checkin.problemTitle')}
          options={MAIN_PROBLEMS.map((item) => ({ value: item, label: t(`checkin.problem.${item}`) }))}
          selected={problem ? [problem] : []}
          onToggle={(item) => setProblem((current) => (current === item ? null : item))}
        />
      </Card>

      {body.weight || body.measurements ? (
        <Card tone="subtle" style={styles.card}>
          <View style={styles.sectionHeading}>
            <View style={[styles.iconWell, { backgroundColor: colors.surface }]}>
              <Icon name="weight" size="md" color="progress" />
            </View>
            <View style={styles.flex}>
              <Text variant="title3">{t('checkin.bodyTitle')}</Text>
              <Text variant="caption" color="textMuted">
                {t('checkin.bodyHint')}
              </Text>
            </View>
          </View>

          {body.weight ? (
            <MassField
              label={(unit) => t('onboarding.profile.body.weight', { unit })}
              valueKg={weight}
              onChange={setWeight}
              error={weight !== undefined && !weightOk ? t('checkin.outOfRange') : undefined}
              deferError
            />
          ) : null}

          {body.measurements ? (
            <NumberField
              label={t('progress.waist')}
              value={waistCm}
              onChange={setWaistCm}
              error={waistCm !== undefined && !waistOk ? t('checkin.outOfRange') : undefined}
              deferError
            />
          ) : null}
        </Card>
      ) : null}

      <View style={styles.footer}>
        <Button
          block
          label={t('checkin.save')}
          disabled={!rating}
          accessibilityHint={rating ? undefined : t('checkin.ratingNeeded')}
          onPress={save}
        />
        {!rating ? (
          <Text variant="caption" color="textMuted" style={styles.center}>
            {t('checkin.ratingNeeded')}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  overview: { gap: spacing.sm },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  ratingCard: { gap: spacing.md },
  card: { gap: spacing.md },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  iconWell: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intro: { gap: spacing.xs },
  questions: { gap: 0, paddingVertical: spacing.xs },
  question: { gap: spacing.sm, paddingVertical: spacing.md },
  questionTop: { gap: 2 },
  footer: { gap: spacing.sm },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
});
