import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Banner, Button, Card, ChoiceGroup, EmptyState, Screen, Text } from '@/components/ui';
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

const LEVELS = [1, 2, 3, 4, 5] as const;
type Level = (typeof LEVELS)[number];
const QUESTIONS = ['energy', 'motivation', 'fatigue', 'nutrition', 'training', 'difficulty'] as const;
type Question = (typeof QUESTIONS)[number];

/**
 * Weekly check-in (docs/ADAPTATION_ENGINE.md §7): under a minute, closed answers only. Weight and
 * waist are asked only to users who already track them; every question except the first is optional.
 */
export default function CheckinScreen() {
  const { t } = useTranslation();
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
  const already = weeklyCheckins.find((c) => c.weekStart === week);
  const last = (dates: string[]) => dates.sort().at(-1) ?? null;
  const body = asksBody(
    plan.today,
    last(weights.map((w) => w.date)),
    last([...waist.map((w) => w.date), ...measurements.map((m) => m.date)]),
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

  const levels = (value: Level | undefined | null, set: (v: Level) => void) => (
    <ChoiceGroup
      options={LEVELS.map((v) => ({ value: v, label: String(v) }))}
      selected={value ? [value] : []}
      onToggle={set}
    />
  );

  return (
    <Screen>
      <Text color="textMuted">{t('checkin.intro')}</Text>
      {already ? <Banner tone="success" message={t('checkin.already')} /> : null}
      <Card>
        <Text variant="heading">{t('checkin.weekRating')}</Text>
        <Text variant="caption" color="textMuted">
          {t('checkin.scale')}
        </Text>
        {levels(rating, setRating)}
      </Card>
      <Card>
        {QUESTIONS.map((q) => (
          <View key={q} style={{ gap: 4 }}>
            <Text variant="label">{t(`checkin.question.${q}`)}</Text>
            <Text variant="caption" color="textMuted">
              {t(`checkin.hint.${q}`)}
            </Text>
            {levels(answers[q], (v) => setAnswers((a) => ({ ...a, [q]: a[q] === v ? undefined : v })))}
          </View>
        ))}
      </Card>
      <Card>
        <Text variant="heading">{t('checkin.problemTitle')}</Text>
        <ChoiceGroup
          options={MAIN_PROBLEMS.map((p) => ({ value: p, label: t(`checkin.problem.${p}`) }))}
          selected={problem ? [problem] : []}
          onToggle={(p) => setProblem((current) => (current === p ? null : p))}
        />
      </Card>
      {body.weight || body.measurements ? (
        <Card>
          <Text variant="heading">{t('checkin.bodyTitle')}</Text>
          <Text variant="caption" color="textMuted">
            {t('checkin.bodyHint')}
          </Text>
          {body.weight ? (
            <MassField
              label={(unit) => t('onboarding.profile.body.weight', { unit })}
              valueKg={weight}
              onChange={setWeight}
            />
          ) : null}
          {body.measurements ? <NumberField label={t('progress.waist')} value={waistCm} onChange={setWaistCm} /> : null}
        </Card>
      ) : null}
      <Button label={t('checkin.save')} disabled={!rating} onPress={save} />
    </Screen>
  );
}
