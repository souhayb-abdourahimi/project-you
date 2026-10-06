import { useState } from 'react';

import type { JourneyMemory } from '@/domain/journey/memory';
import { UserContextSnapshot } from '@/domain/profile/schemas';
import type { SessionExercise } from '@/domain/training/session';
import { useDataStore } from '@/state/data';
import { useProfileStore } from '@/state/profile';

/**
 * Personal preference (D-034, D-031 D): observed on several sessions, asked once at the end of a
 * session where it came up, durable only once the user confirms (then it goes to the profile:
 * excluded exercises, which publishes the next program version). Never inferred on its own.
 */
export function usePreferenceQuestion(memory: JourneyMemory | null, exercises: readonly SessionExercise[]) {
  const [answer, setAnswer] = useState<'removed' | 'kept' | null>(null);
  const [asked, setAsked] = useState<{ exerciseId: string; count: number } | null>(null);
  const suggestion = memory?.suggestions.find(
    (s) => s.kind === 'drop_exercise' && exercises.some((e) => e.replaced && e.prescribedId === s.exerciseId),
  );
  const question =
    asked ??
    (suggestion?.kind === 'drop_exercise' ? { exerciseId: suggestion.exerciseId, count: suggestion.count } : null);
  if (!question) return null;
  return {
    exerciseId: question.exerciseId,
    answer,
    remove: () => {
      const snapshot = useProfileStore.getState().snapshot;
      if (!snapshot) return;
      const ids = [...new Set([...snapshot.training.refusedExerciseIds, question.exerciseId])];
      const next = UserContextSnapshot.safeParse({
        ...snapshot,
        training: { ...snapshot.training, refusedExerciseIds: ids },
      });
      if (!next.success) return;
      setAsked(question);
      setAnswer('removed');
      useProfileStore.getState().setSnapshot(next.data);
    },
    keep: () => {
      setAsked(question);
      setAnswer('kept');
      useDataStore.getState().keepExercise(question.exerciseId, question.count);
    },
  };
}
