import { useState } from 'react';

import { decisionFor, proposalKey } from '@/domain/journey/adjustments';
import type { JourneyMemory } from '@/domain/journey/memory';
import { startOfWeek, toIsoDate } from '@/domain/shared/dates';
import type { SessionExercise } from '@/domain/training/session';
import { replacementPreview } from '@/domain/training/structure';
import { activeProgram } from '@/domain/training/week';
import { newId } from '@/lib/id';
import { useDataStore } from '@/state/data';

/**
 * Personal preference (D-034, D-037 §8): observed on several sessions, asked once at the end of a
 * session where it came up, durable only once the user confirms. The answer is a decision on the
 * same `exercise_change` proposal the Daily Coach would make (one journal, synced): "le retirer"
 * applies it (the next program version excludes the exercise), "le garder" declines it. Never
 * inferred on its own; the profile is not touched.
 */
export function usePreferenceQuestion(memory: JourneyMemory | null, exercises: readonly SessionExercise[]) {
  const [answer, setAnswer] = useState<'removed' | 'kept' | null>(null);
  const [asked, setAsked] = useState<{ exerciseId: string; count: number; to: string | null } | null>(null);
  const suggestion = memory?.suggestions.find(
    (s) => s.kind === 'drop_exercise' && exercises.some((e) => e.replaced && e.prescribedId === s.exerciseId),
  );
  const question =
    asked ??
    (suggestion?.kind === 'drop_exercise'
      ? { exerciseId: suggestion.exerciseId, count: suggestion.count, to: null }
      : null);
  if (!question) return null;
  const decide = (status: 'applied' | 'declined') => {
    const store = useDataStore.getState();
    const today = toIsoDate(new Date());
    const params = activeProgram(store.programs)?.params ?? null;
    const to = params ? replacementPreview(params, question.exerciseId) : null;
    store.saveAdjustment(
      decisionFor({
        id: newId(),
        proposal: {
          id: proposalKey('training', 'exercise_change', question.exerciseId, startOfWeek(today)),
          kind: 'training',
          change: { key: 'exercise_change', from: question.exerciseId, ...(to ? { to } : {}) },
          reason: { key: 'adaptation.reason.exercise_preference' },
          evidence: { occurrences: question.count },
          scope: { kind: 'durable' },
        },
        status,
        today,
        decidedAt: new Date().toISOString(),
      }),
    );
    setAsked({ ...question, to });
    setAnswer(status === 'applied' ? 'removed' : 'kept');
  };
  return {
    exerciseId: question.exerciseId,
    /** What the next program version puts in its place (engine preview), once removed. */
    replacement: asked?.to ?? null,
    answer,
    remove: () => decide('applied'),
    keep: () => decide('declined'),
  };
}
