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
  Icon,
  Screen,
  ScreenHeader,
  Section,
  Text,
} from '@/components/ui';
import {
  asksBody,
  checkinWeek,
  MAIN_PROBLEMS,
  type MainProblem,
  type WeeklyCheckin,
} from '@/domain/journey/weekly-checkin';
import { MassField, NumberField } from '@/features/onboarding/fields';
import { usePlan } from '@/hooks/usePlan';
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
  const { t } = useTranslation();
  const colors = useColors();
  const plan = usePlan();
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
  const last = (dates: string[]) => dates.sort().at(-1) ?? null;
  const body = asksBody(
    plan.today,
    last(weights.map((entry) => entry.date)),
    last([...waist.map((entry) => entry.date), ...measurements.map((entry) => entry.date)]),
  );

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
    if (body.weight && weight && weight >= 25 && weight <= 400) logWeight(plan.today, weight);
    if (body.measurements && waistCm && waistCm >= 10 && waistCm <= 300) logWaist(plan.today, waistCm);
    router.replace('/review');
  };

  const levels = (value: Level | undefined | null, set: (level: Level) => void) => (
    <ChoiceGroup
      single
      options={LEVELS.map((level) => ({ value: level, label: String(level) }))}
      selected={value ? [value] : []}
      onToggle={set}
    />
  );

  return (
    <Screen airy>
      <ScreenHeader title={t('checkin.title')} subtitle={t('checkin.intro')} />

      {already ? <Banner tone="success" message={t('checkin.already')} /> : null}

      <Card raised style={styles.ratingCard}>
        <View style={styles.sectionHeading}>
          <View style={[styles.iconWell, { backgroundColor: colors.primarySubtle }]}>
            <Icon name="checkin" size="md" color="primary" />
          </View>
          <View style={styles.flex}>
            <Text variant="title3">{t('checkin.weekRating')}</Text>
            <Text variant="caption" color="textMuted">
              {t('checkin.scale')}
            </Text>
          </View>
        </View>

        <View style={styles.scale}>{levels(rating, setRating)}</View>
      </Card>

      <Section title={t('checkin.title')}>
        <View style={styles.questionStack}>
          {QUESTIONS.map((question) => (
            <Card key={question} dense style={styles.questionCard}>
              <Text variant="headline">{t(`checkin.question.${question}`)}</Text>
              <Text variant="caption" color="textMuted">
                {t(`checkin.hint.${question}`)}
              </Text>
              <View style={styles.scale}>
                {levels(answers[question], (level) =>
                  setAnswers((current) => ({
                    ...current,
                    [question]: current[question] === level ? undefined : level,
                  })),
                )}
              </View>
            </Card>
          ))}
        </View>
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
            />
          ) : null}

          {body.measurements ? (
            <NumberField label={t('progress.waist')} value={waistCm} onChange={setWaistCm} />
          ) : null}
        </Card>
      ) : null}

      <View style={styles.footer}>
        <Text variant="caption" color="textMuted">
          {t('checkin.scale')}
        </Text>
        <Button block label={t('checkin.save')} disabled={!rating} onPress={save} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  ratingCard: { gap: spacing.xl },
  card: { gap: spacing.lg },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  iconWell: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionStack: { gap: spacing.md },
  questionCard: { gap: spacing.md },
  scale: { paddingTop: spacing.xs },
  footer: { gap: spacing.sm },
  flex: { flex: 1 },
});
