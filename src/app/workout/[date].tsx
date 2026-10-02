import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Banner, Button, EmptyState, Screen, Text } from '@/components/ui';
import type { SessionVariant } from '@/domain/training/adapt';
import type { SessionLog } from '@/domain/training/progression';
import { ExerciseCard } from '@/features/training/ExerciseCard';
import { useWorkoutSession } from '@/features/training/useWorkoutSession';
import { usePlan } from '@/hooks/usePlan';
import { useDataStore } from '@/state/data';

export default function WorkoutScreen() {
  const { t } = useTranslation();
  const { date, variant: variantParam } = useLocalSearchParams<{ date: string; variant?: SessionVariant }>();
  const plan = usePlan();
  const { setLogs, exerciseSwaps, logSet, swapExercise, completeSession } = useDataStore();
  // The frozen prescription of the day (or the proposal, off plan): never rebuilt from the profile.
  const workout = useWorkoutSession(plan, date, variantParam);
  if (!plan) return null;
  if (!workout)
    return (
      <Screen>
        <EmptyState message={t('today.noSession')} />
      </Screen>
    );
  const { key, sessionIndex, variant, done } = workout;

  // History for the progression engine: previous sessions' sets, oldest first.
  const historyFor = (exerciseId: string): SessionLog[] =>
    Object.entries(setLogs)
      .filter(([k, logs]) => k !== key && logs[exerciseId]?.length)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, logs]) => ({ date: k.split('#')[0], sets: logs[exerciseId] }));

  return (
    <Screen>
      <Text variant="title">
        {t(`enums.focus.${workout.focus}`)} {variant !== 'full' ? `· ${t(`workout.${variant}`)}` : ''}
      </Text>
      <Text color="textMuted">{t('program.estimated', { count: workout.estimatedMinutes })}</Text>
      <Banner message={t('workout.pain')} tone="textMuted" />
      {workout.exercises.map((p) => {
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
            onSwap={(toId, reason) => swapExercise(key, p.exerciseId, toId, reason)}
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
