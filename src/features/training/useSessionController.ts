import { useMemo, useState } from 'react';

import type { SessionReason } from '@/domain/journey/outcomes';
import type { JourneyState } from '@/domain/journey/state';
import { difficultyScore, type DifficultyLevel } from '@/domain/training/program';
import type { ReplacementReason } from '@/domain/training/replacement';
import {
  coachHint,
  exerciseStatus,
  lastPerformance,
  makeSet,
  prefill,
  SET_FEELS,
  sessionProgress,
  sessionResult,
  sessionSummary,
  type SetFeel,
} from '@/domain/training/session';
import { useDataStore } from '@/state/data';
import { useWorkoutUi } from '@/state/workout';

import type { WorkoutSessionView } from './useWorkoutSession';

export interface SetInput {
  loadKg: number | null | undefined;
  value: number | null | undefined;
  feel?: SetFeel | null;
}

/**
 * What the session screen does, so the components stay thin: the current exercise and what it
 * shows (from the domain engine), and every action as a store write. Nothing here decides a load or
 * a progression; the data comes from the stored prescription and the real sets (D-034).
 */
export function useSessionController(view: WorkoutSessionView, journey: JourneyState | null) {
  const setLogs = useDataStore((s) => s.setLogs);
  const reports = useDataStore((s) => s.exerciseReports[view.key]);
  const swapReasons = useDataStore((s) => s.swapReasons[view.key]);
  const openedAt = useDataStore((s) => s.sessionOpened[view.key] ?? null);
  const difficulty = useDataStore((s) => s.sessionDifficulty[view.key] ?? null);
  const completed = useDataStore((s) =>
    s.completedSessions.find((c) => c.date === view.date && c.sessionIndex === view.sessionIndex),
  );
  const outcome = useDataStore((s) => s.sessionOutcomes[view.key] ?? null);
  const store = useDataStore.getState;
  const ui = useWorkoutUi.getState;

  const sets = useMemo(() => setLogs[view.key] ?? {}, [setLogs, view.key]);
  const progress = sessionProgress(view.exercises, sets, reports);
  const [picked, setPicked] = useState<number | null>(null);
  const index = Math.min(picked ?? progress.current ?? view.exercises.length - 1, view.exercises.length - 1);
  const current = view.exercises[index] ?? null;

  // Today's fatigue or the safety rule: a planned increase is not prefilled (no new decision, W-4).
  const holdIncrease =
    !!journey && (journey.difficulties.fatigue === 'high' || journey.safety.flags.includes('training_load'));
  const exercise = useMemo(() => {
    if (!current) return null;
    const today = sets[current.exerciseId] ?? [];
    const last = lastPerformance(setLogs, current.exerciseId, view.key);
    const pre = prefill(current, today, last, { holdIncrease });
    return {
      ...current,
      index,
      today,
      last,
      prefill: pre,
      hint: coachHint(current, today, last, pre),
      status: exerciseStatus(current, today, reports?.[current.prescribedId]),
      report: reports?.[current.prescribedId] ?? null,
    };
  }, [current, index, sets, setLogs, view.key, holdIncrease, reports]);

  const result = sessionResult({
    completed: completed ?? null,
    outcome,
    exercises: view.exercises,
    sets,
    reports: reports ?? {},
  });

  const actions = {
    goTo: (i: number) => setPicked(i),
    next: () => {
      const after = view.exercises.findIndex(
        (e, i) =>
          i > index &&
          ['pending', 'in_progress'].includes(exerciseStatus(e, sets[e.exerciseId] ?? [], reports?.[e.prescribedId])),
      );
      setPicked(after === -1 ? (progress.current ?? index) : after);
    },
    /** Returns false when the input is not a valid set (nothing is written). */
    logSet: (input: SetInput): boolean => {
      if (!current) return false;
      const set = makeSet(current.unit, { ...input, rpe: input.feel ? SET_FEELS[input.feel] : undefined });
      if (!set) return false;
      store().logSet(view.key, current.exerciseId, set);
      // Stay on this exercise after its last set (its difficulty, then "Exercice suivant").
      setPicked(index);
      if (exercise?.report?.notPerformed)
        store().reportExercise(view.key, current.prescribedId, { notPerformed: false });
      ui().startRest(view.key, current.exerciseId, current.restSeconds);
      return true;
    },
    editSet: (setIndex: number, input: SetInput): boolean => {
      if (!current) return false;
      const set = makeSet(current.unit, { ...input, rpe: input.feel ? SET_FEELS[input.feel] : undefined });
      if (!set) return false;
      store().editSet(view.key, current.exerciseId, setIndex, set);
      return true;
    },
    deleteSet: (setIndex: number) => current && store().deleteSet(view.key, current.exerciseId, setIndex),
    replace: (toId: string, reason: ReplacementReason) => {
      if (!current) return;
      store().swapExercise(view.key, current.prescribedId, toId, reason);
    },
    undoReplace: () => current && store().swapExercise(view.key, current.prescribedId, current.prescribedId),
    notPerformed: (reason: ReplacementReason | null) => {
      if (!current) return;
      store().reportExercise(view.key, current.prescribedId, {
        notPerformed: true,
        ...(reason ? { notPerformedReason: reason } : {}),
      });
      ui().skipRest();
      actions.next();
    },
    undoNotPerformed: () => current && store().reportExercise(view.key, current.prescribedId, { notPerformed: false }),
    rateExercise: (level: DifficultyLevel) =>
      current && store().reportExercise(view.key, current.prescribedId, { difficulty: difficultyScore(level) }),
    finish: (stopped?: SessionReason) => {
      ui().skipRest();
      store().completeSession({
        date: view.date,
        sessionIndex: view.sessionIndex,
        variant: view.variant,
        ...(stopped ? { stopped } : {}),
      });
    },
    rateSession: (level: DifficultyLevel) => store().rateSession(view.key, difficultyScore(level)),
  };

  const summary = completed
    ? sessionSummary({
        key: view.key,
        exercises: view.exercises,
        setLogs,
        reports: reports ?? {},
        swapReasons: swapReasons ?? {},
        openedAt,
        endedAt: completed.completedAt,
      })
    : null;

  return { exercise, progress, result, summary, difficulty, actions };
}

export type SessionController = ReturnType<typeof useSessionController>;
