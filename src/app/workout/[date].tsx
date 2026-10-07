import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { EmptyState, LoadingScreen, Screen } from '@/components/ui';
import type { SessionVariant } from '@/domain/training/adapt';
import { WorkoutSession } from '@/features/training/WorkoutSession';
import { useWorkoutSession } from '@/features/training/useWorkoutSession';
import { useJourney } from '@/hooks/useJourney';
import { usePlan } from '@/hooks/usePlan';

const VARIANTS: SessionVariant[] = ['full', 'short', 'light'];

/** Route params are user input: an unknown variant or duration is ignored, never trusted. */
function readParams(p: { variant?: string; minutes?: string; index?: string }) {
  const variant = VARIANTS.find((v) => v === p.variant);
  const minutes = Number(p.minutes);
  // Which session of the day (W-7.1): its slot, never the first one by default when a link names it.
  const index = p.index !== undefined && /^\d{1,2}$/.test(p.index) ? Number(p.index) : undefined;
  return {
    variant,
    minutes: Number.isInteger(minutes) && minutes >= 5 && minutes <= 180 ? minutes : undefined,
    ...(index !== undefined ? { sessionIndex: index } : {}),
  };
}

export default function WorkoutScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ date: string; variant?: string; minutes?: string; index?: string }>();
  const request = readParams(params);
  const plan = usePlan();
  const journey = useJourney(plan);
  // The workout the Daily Coach chose today: the screen does not ask again.
  const item = journey?.daily.items.find(
    (i) =>
      i.kind === 'workout' &&
      i.status === 'todo' &&
      (request.sessionIndex === undefined || i.params.sessionIndex === request.sessionIndex),
  );
  const coach = item
    ? {
        variant: (VARIANTS.find((v) => v === item.params.variant) ?? 'full') as SessionVariant,
        minutes: Number(item.params.minutes),
      }
    : null;
  const view = useWorkoutSession(plan, params.date, { ...request, coach });
  if (!plan) return <LoadingScreen />;
  return (
    <Screen>
      {view ? (
        <WorkoutSession view={view} journey={journey} training={plan.snapshot.training} />
      ) : (
        <EmptyState message={t('workout.unavailable')} />
      )}
    </Screen>
  );
}
