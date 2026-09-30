import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Banner, Button, EmptyState, Screen, Text } from '@/components/ui';
import { lightSession, shortSession, type SessionVariant } from '@/domain/training/adapt';
import type { SessionLog } from '@/domain/training/progression';
import { ExerciseCard } from '@/features/training/ExerciseCard';
import { usePlan } from '@/hooks/usePlan';
import { useDataStore } from '@/state/data';

export default function WorkoutScreen() {
  const { t } = useTranslation();
  const { date, variant: variantParam } = useLocalSearchParams<{ date: string; variant?: SessionVariant }>();
  const plan = usePlan();
  const { setLogs, exerciseSwaps, logSet, swapExercise, completeSession, completedSessions } = useDataStore();
  if (!plan) return null;

  const day = plan.schedule.days.find((d) => d.date === date);
  const item = day?.items.find((i) => i.kind === 'workout');
  // A day without a planned session still gets session 0 when the user asked for a short/light version.
  const sessionIndex = item?.kind === 'workout' ? item.sessionIndex : 0;
  const template = plan.workoutPlan.sessions[sessionIndex];
  if (!template)
    return (
      <Screen>
        <EmptyState message={t('today.noSession')} />
      </Screen>
    );

  const variant: SessionVariant =
    variantParam ?? (item?.kind === 'workout' && item.variant === 'short' ? 'short' : 'full');
  const session =
    variant === 'short'
      ? shortSession(template, {
          minutes: 15,
          equipment: plan.snapshot.training.hasGym ? ['bodyweight'] : plan.snapshot.training.equipment,
          level: plan.snapshot.training.level,
          refusedExerciseIds: plan.snapshot.training.refusedExerciseIds,
        })
      : variant === 'light'
        ? lightSession(template)
        : { variant, exercises: template.exercises, estimatedMinutes: template.estimatedMinutes, atHome: false };
  const key = `${date}#${sessionIndex}`;
  const done = completedSessions.some((c) => c.date === date && c.sessionIndex === sessionIndex);

  // History for the progression engine: previous sessions' sets, oldest first.
  const historyFor = (exerciseId: string): SessionLog[] =>
    Object.entries(setLogs)
      .filter(([k, logs]) => k !== key && logs[exerciseId]?.length)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, logs]) => ({ date: k.split('#')[0], sets: logs[exerciseId] }));

  return (
    <Screen>
      <Text variant="title">
        {t(`enums.focus.${template.focus}`)} {variant !== 'full' ? `· ${t(`workout.${variant}`)}` : ''}
      </Text>
      <Text color="textMuted">{t('program.estimated', { count: session.estimatedMinutes })}</Text>
      <Banner message={t('workout.pain')} tone="textMuted" />
      {session.exercises.map((p) => {
        const exerciseId = exerciseSwaps[key]?.[p.exerciseId] ?? p.exerciseId;
        return (
          <ExerciseCard
            key={`${p.exerciseId}-${exerciseId}`}
            prescription={p}
            exerciseId={exerciseId}
            logged={setLogs[key]?.[exerciseId] ?? []}
            history={historyFor(exerciseId)}
            training={plan.snapshot.training}
            onLog={(s) => logSet(key, exerciseId, s)}
            onSwap={(toId) => swapExercise(key, p.exerciseId, toId)}
          />
        );
      })}
      {done ? (
        <Banner tone="success" message={t('workout.finished')} />
      ) : (
        <Button
          label={t('workout.finish')}
          onPress={() => {
            completeSession({ date, sessionIndex, variant });
            router.back();
          }}
        />
      )}
    </Screen>
  );
}
