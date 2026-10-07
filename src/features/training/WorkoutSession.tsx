import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Banner, Button } from '@/components/ui';
import type { Journey } from '@/hooks/useJourney';
import type { TrainingProfile } from '@/domain/profile/schemas';
import { useDataStore } from '@/state/data';
import { useStorageHealth } from '@/state/storage';
import { useSyncStatus } from '@/state/sync';
import { spacing } from '@/theme';

import { CurrentExercise } from './CurrentExercise';
import { ExerciseList } from './ExerciseList';
import { FinishPanel } from './FinishPanel';
import { RestTimer } from './RestTimer';
import { SessionHeader } from './SessionHeader';
import { SessionSummary } from './SessionSummary';
import { usePreferenceQuestion } from './usePreferenceQuestion';
import { useSessionController } from './useSessionController';
import type { WorkoutSessionView } from './useWorkoutSession';

/** The session in progress, then its summary (W-3, D-034). Thin: data and actions come from hooks. */
export function WorkoutSession({
  view,
  journey,
  training,
}: {
  view: WorkoutSessionView;
  journey: Journey | null;
  training: TrainingProfile;
}) {
  const { t } = useTranslation();
  const controller = useSessionController(view, journey?.state ?? null);
  const preference = usePreferenceQuestion(journey?.memory ?? null, view.exercises);
  const sets = useDataStore((s) => s.setLogs[view.key]) ?? {};
  const reports = useDataStore((s) => s.exerciseReports[view.key]) ?? {};
  const saveFailed = useStorageHealth((s) => s.saveFailed);
  const phase = useSyncStatus((s) => s.phase);
  const { progress, exercise, summary } = controller;

  const banners = (
    <>
      {saveFailed ? <Banner message={t('workout.saveFailed')} /> : null}
      {phase === 'offline' ? <Banner tone="textMuted" message={t('workout.offline')} /> : null}
      {phase === 'error' ? <Banner tone="textMuted" message={t('workout.syncPending')} /> : null}
    </>
  );

  if (summary)
    return (
      <View style={{ gap: spacing.lg }}>
        {banners}
        <SessionSummary
          summary={summary}
          result={controller.result}
          difficulty={controller.difficulty}
          onRate={controller.actions.rateSession}
          preference={preference}
        />
      </View>
    );

  const started = progress.setsDone > 0 || progress.exercisesSettled > 0;
  return (
    <View style={{ gap: spacing.lg }}>
      <SessionHeader view={view} progress={progress} />
      {banners}
      <RestTimer session={view.key} />
      {exercise ? (
        <CurrentExercise
          key={exercise.prescribedId}
          controller={controller}
          total={view.exercises.length}
          training={training}
        />
      ) : null}
      <FinishPanel remaining={progress.total - progress.exercisesSettled} onFinish={controller.actions.finish} />
      <ExerciseList
        exercises={view.exercises}
        sets={sets}
        reports={reports}
        current={exercise?.index ?? 0}
        onOpen={controller.actions.goTo}
      />
      {!started && view.date === journey?.daily.date ? (
        <Button
          compact
          variant="ghost"
          label={t('workout.notToday')}
          onPress={() => router.push({ pathname: '/adapt', params: { mode: 'motivation' } })}
        />
      ) : null}
      <Banner message={t('workout.pain')} tone="textMuted" />
    </View>
  );
}
