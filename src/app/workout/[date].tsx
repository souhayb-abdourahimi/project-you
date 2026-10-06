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
function readParams(p: { variant?: string; minutes?: string }) {
  const variant = VARIANTS.find((v) => v === p.variant);
  const minutes = Number(p.minutes);
  return { variant, minutes: Number.isInteger(minutes) && minutes >= 5 && minutes <= 180 ? minutes : undefined };
}

export default function WorkoutScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ date: string; variant?: string; minutes?: string }>();
  const plan = usePlan();
  const journey = useJourney(plan);
  // The workout the Daily Coach chose today: the screen does not ask again.
  const item = journey?.daily.items.find((i) => i.kind === 'workout' && i.status === 'todo');
  const coach = item
    ? {
        variant: (VARIANTS.find((v) => v === item.params.variant) ?? 'full') as SessionVariant,
        minutes: Number(item.params.minutes),
      }
    : null;
  const view = useWorkoutSession(plan, params.date, { ...readParams(params), coach });
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
