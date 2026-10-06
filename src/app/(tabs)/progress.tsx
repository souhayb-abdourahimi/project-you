import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Banner, Button, Card, LoadingScreen, Screen, Section, Text } from '@/components/ui';
import type { ProgressJourney, ProgressSection } from '@/domain/journey/progress-journey';
import { getExercise } from '@/domain/training/exercises';
import { NumberField } from '@/features/onboarding/fields';
import { Recommendations } from '@/features/journey/Recommendations';
import { TrainingWeekCard } from '@/features/program/TrainingWeekCard';
import { useJourney } from '@/hooks/useJourney';
import { usePlan } from '@/hooks/usePlan';
import { formatDate } from '@/lib/format';
import { useDataStore } from '@/state/data';
import { spacing } from '@/theme';

type T = (key: string, params?: Record<string, unknown>) => string;

const signed = (v: number) => (v > 0 ? `+${v}` : String(v));

/** "Mon évolution" (docs/PROGRESS_JOURNEY.md §2): the story since the start, only measured values. */
export default function ProgressScreen() {
  const { t, i18n } = useTranslation();
  const plan = usePlan();
  const journey = useJourney(plan);
  if (!plan || !journey) return <LoadingScreen />;
  const { progress } = journey;
  const goal = plan.snapshot.goal.type;
  const date = (d: string) => formatDate(d, i18n.language);

  const sections: Record<ProgressSection, ReactNode> = {
    since_start: <SinceStart key="since_start" progress={progress} />,
    body: <Body key="body" progress={progress} recomposition={goal === 'recomposition'} today={plan.today} />,
    performance: <Performance key="performance" progress={progress} />,
    habits: <Habits key="habits" progress={progress} />,
  };

  return (
    <Screen>
      <Text variant="display" accessibilityRole="header">
        {t('progress.title')}
      </Text>
      {progress.empty ? (
        <Card>
          <Text variant="heading">{t('progress.empty.title')}</Text>
          <Text>{t('progress.empty.body')}</Text>
          <Button label={t('progress.empty.cta')} onPress={() => router.push('/')} />
        </Card>
      ) : (
        <>
          {progress.notes.map((n) => (
            <Banner key={n.key} tone="primary" message={t(n.key, n.params)} />
          ))}
          {/* What changed in the program, after the user's yes (D-037 §38): two facts, no redesign. */}
          {journey.active
            .filter((a) => a.key === 'light_week' || a.key === 'exercise_change')
            .map((a) => (
              <Banner key={a.decision.id} tone="primary" message={t(`progress.adapted.${a.key}`)} />
            ))}
          <TrainingWeekCard week={journey.trainingWeek} />
          {progress.order.map((s) => sections[s])}
          <Section title={t('progress.path.title')}>
            <Path progress={progress} date={date} />
          </Section>
          <Section title={t('adaptation.title')}>
            <Recommendations recommendations={journey.recommendations} today={plan.today} effects={journey.effects} />
          </Section>
        </>
      )}
      {progress.empty ? <Body progress={progress} recomposition={goal === 'recomposition'} today={plan.today} /> : null}
      <Button variant="secondary" label={t('review.open')} onPress={() => router.push('/review')} />
    </Screen>
  );
}

function SinceStart({ progress }: { progress: ProgressJourney }) {
  const { t } = useTranslation();
  const s = progress.sinceStart;
  const sessions = s.adherence?.sessions;
  return (
    <Section title={t('progress.since.title')}>
      <Card>
        <Text variant="heading">
          {s.days === 0 ? t('progress.since.today') : t('progress.since.days', { count: s.days })}
        </Text>
        <Text>
          {t('progress.since.summary', {
            activeDays: s.activeDays,
            sessions: s.sessions,
          })}
        </Text>
        {s.regularity.streakWeeks >= 1 ? (
          <Text>{t('progress.since.streak', { count: s.regularity.streakWeeks })}</Text>
        ) : null}
        {sessions && sessions.planned > 0 ? (
          // Said positively, never in red: done and adapted sessions both count.
          <Text color="textMuted">
            {t(
              sessions.done + sessions.adapted >= sessions.planned
                ? 'progress.since.adherenceAll'
                : sessions.adapted > 0
                  ? 'progress.since.adherenceAdapted'
                  : 'progress.since.adherence',
              {
                done: sessions.done + sessions.adapted,
                planned: sessions.planned,
                adapted: sessions.adapted,
              },
            )}
          </Text>
        ) : null}
      </Card>
    </Section>
  );
}

function Body({
  progress,
  recomposition,
  today,
}: {
  progress: ProgressJourney;
  recomposition: boolean;
  today: string;
}) {
  const { t } = useTranslation();
  const { weight, waist, others } = progress.body;
  const blocks: ReactNode[] = [];
  // Measures the user records but the goal does not put forward still show, after the others.
  const order = [
    ...progress.bodyOrder,
    ...(['waist', 'weight'] as const).filter((b) => !progress.bodyOrder.includes(b)),
  ];
  for (const block of order) {
    if (block === 'waist' && waist) {
      blocks.push(
        <View key="waist" style={{ gap: 2 }}>
          <Text variant="label">{t('progress.body.waist')}</Text>
          <Text variant="heading">{t('progress.body.cm', { value: waist.currentCm })}</Text>
          {waist.changeCm !== null ? (
            <Text color="textMuted">
              {t('progress.body.sinceStartCm', { change: signed(waist.changeCm), start: waist.startCm })}
            </Text>
          ) : null}
        </View>,
      );
    }
    if (block === 'weight' && weight) {
      // In recomposition the scale is secondary: smaller, last (§3).
      blocks.push(
        <View key="weight" style={{ gap: 2 }}>
          <Text variant="label">{t('progress.body.weight')}</Text>
          <Text variant={recomposition ? 'body' : 'heading'}>
            {weight.currentAvgKg === null ? t('common.unavailable') : t('common.kg', { value: weight.currentAvgKg })}
          </Text>
          <Text color="textMuted" variant={recomposition ? 'caption' : 'body'}>
            {weight.changeKg === null
              ? t('progress.body.notYetComparable')
              : t('progress.body.sinceStartKg', { change: signed(weight.changeKg), start: weight.startAvgKg })}
          </Text>
        </View>,
      );
    }
  }
  for (const m of others) {
    blocks.push(
      <Text key={m.kind}>
        {t('progress.body.other', {
          kind: t(`progress.measure.${m.kind}`, { defaultValue: m.kind }),
          value: m.currentCm,
          change: m.changeCm === null ? '' : ` (${signed(m.changeCm)} cm)`,
        })}
      </Text>,
    );
  }
  return (
    <Section title={t('progress.body.title')}>
      {blocks.length > 0 ? <Card>{blocks}</Card> : null}
      <QuickEntry today={today} />
    </Section>
  );
}

/** A weigh-in or a waist measurement, in one gesture (kept from the previous screen). */
function QuickEntry({ today }: { today: string }) {
  const { t } = useTranslation();
  const logWeight = useDataStore((s) => s.logWeight);
  const logWaist = useDataStore((s) => s.logWaist);
  const [weight, setWeight] = useState<number | undefined>();
  const [waistCm, setWaistCm] = useState<number | undefined>();
  const [formKey, setFormKey] = useState(0);
  return (
    <Card muted>
      <NumberField
        key={`w${formKey}`}
        label={t('onboarding.profile.body.weight')}
        value={weight}
        onChange={setWeight}
      />
      <Button
        label={t('progress.logWeight')}
        disabled={!weight || weight < 25 || weight > 400}
        onPress={() => {
          if (weight) logWeight(today, weight);
          setWeight(undefined);
          setFormKey((k) => k + 1);
        }}
      />
      <NumberField key={`c${formKey}`} label={t('progress.waist')} value={waistCm} onChange={setWaistCm} />
      <Button
        variant="secondary"
        label={t('progress.logWaist')}
        disabled={!waistCm || waistCm < 10 || waistCm > 300}
        onPress={() => {
          if (waistCm) logWaist(today, waistCm);
          setWaistCm(undefined);
          setFormKey((k) => k + 1);
        }}
      />
    </Card>
  );
}

function exerciseName(id: string, lang: string) {
  const e = getExercise(id);
  return e ? e.name[lang === 'en' ? 'en' : 'fr'] : id;
}

function Performance({ progress }: { progress: ProgressJourney }) {
  const { t, i18n } = useTranslation();
  const { records, exercises } = progress.performance;
  const up = exercises.filter((e) => e.trend === 'up').slice(0, 5);
  // The latest record of each exercise (records come newest first), three at most.
  const latestRecords = records
    .filter((r, i) => records.findIndex((x) => x.exerciseId === r.exerciseId) === i)
    .slice(0, 3);
  const set = (s: { loadKg: number; reps: number; seconds?: number }) =>
    s.seconds !== undefined
      ? t('progress.perf.seconds', { seconds: s.seconds })
      : s.loadKg > 0
        ? t('progress.perf.set', s)
        : t('progress.perf.reps', { reps: s.reps });
  return (
    <Section title={t('progress.perf.title')}>
      <Card>
        {records.length === 0 && up.length === 0 ? <Text color="textMuted">{t('progress.perf.none')}</Text> : null}
        {up.map((e) => (
          <Text key={e.exerciseId}>
            {t('progress.perf.trend', {
              name: exerciseName(e.exerciseId, i18n.language),
              from: set(e.from),
              to: set(e.to),
            })}
          </Text>
        ))}
        {latestRecords.map((r) => (
          <Text key={`${r.exerciseId}${r.date}`} color="textMuted">
            {t(`progress.perf.${{ load: 'recordLoad', reps: 'recordReps', time: 'recordTime' }[r.kind]}`, {
              name: exerciseName(r.exerciseId, i18n.language),
              set: set(r),
              date: formatDate(r.date, i18n.language),
            })}
          </Text>
        ))}
      </Card>
    </Section>
  );
}

function Habits({ progress }: { progress: ProgressJourney }) {
  const { t } = useTranslation();
  const h = progress.habits;
  const lines: [string, number][] = [
    ['progress.habits.trainingWeeks', h.trainingWeeks],
    ['progress.habits.mealsLoggedDays', h.mealsLoggedDays],
    ['progress.habits.activityDays', h.activityDays],
    ['progress.habits.weighInWeeks', h.weighInWeeks],
    ['progress.habits.checkins', h.checkins],
  ];
  const shown = lines.filter(([, n]) => n > 0);
  return (
    <Section title={t('progress.habits.title')}>
      <Card>
        {shown.length === 0 ? <Text color="textMuted">{t('progress.habits.none')}</Text> : null}
        {shown.map(([key, count]) => (
          <Text key={key}>{t(key, { count })}</Text>
        ))}
      </Card>
    </Section>
  );
}

function Path({ progress, date }: { progress: ProgressJourney; date: (d: string) => string }) {
  const { t } = useTranslation();
  // The path already shows its steps; the five latest other milestones, newest first.
  const milestones = progress.milestones
    .filter((m) => !m.id.startsWith('checkpoint_'))
    .sort((a, b) => b.reachedOn.localeCompare(a.reachedOn))
    .slice(0, 5);
  return (
    <>
      <Card>
        {progress.path.map((c) => (
          <View
            key={c.key}
            style={{ flexDirection: 'row', gap: spacing.sm }}
            accessibilityLabel={`${t(`progress.path.${c.key}`)}, ${t(`progress.path.status.${c.status}`)}`}>
            <Text
              accessibilityElementsHidden
              importantForAccessibility="no"
              color={c.status === 'reached' ? 'success' : c.status === 'current' ? 'primary' : 'textMuted'}>
              {c.status === 'reached' ? '✓' : c.status === 'current' ? '●' : '○'}
            </Text>
            <View style={{ flex: 1 }}>
              <Text color={c.status === 'upcoming' ? 'textMuted' : 'text'}>
                {t('progress.path.step', { step: c.step, label: t(`progress.path.${c.key}`) })}
              </Text>
              <Text variant="caption" color="textMuted">
                {c.reachedOn
                  ? t('progress.path.reachedOn', { date: date(c.reachedOn) })
                  : t(`progress.path.status.${c.status}`)}
              </Text>
            </View>
          </View>
        ))}
      </Card>
      {milestones.length > 0 ? (
        <Card muted>
          <Text variant="label">{t('progress.milestones.title')}</Text>
          {milestones.map((m) => (
            <Text key={m.id}>
              {t('progress.milestones.item', { label: milestoneLabel(m.id, t), date: date(m.reachedOn) })}
            </Text>
          ))}
        </Card>
      ) : null}
    </>
  );
}

function milestoneLabel(id: string, t: T): string {
  const n = id.match(/_(\d+)$/)?.[1];
  if (id.startsWith('sessions_')) return t('progress.milestones.sessions', { count: Number(n) });
  if (id.startsWith('weeks_streak_')) return t('progress.milestones.weeks_streak', { count: Number(n) });
  if (id.startsWith('active_days_')) return t('progress.milestones.active_days', { count: Number(n) });
  if (id.startsWith('checkpoint_')) return t('progress.milestones.checkpoint', { step: Number(n) });
  return t(`progress.milestones.${id}`);
}
