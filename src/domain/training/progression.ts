import type { Rationale } from '../shared/rationale';
import { getExercise } from './exercises';

export interface LoggedSet {
  reps: number;
  loadKg: number;
  /** Rate of perceived exertion 1–10, optional. */
  rpe?: number;
}

export interface SessionLog {
  date: string;
  sets: LoggedSet[];
}

export type FatigueLevel = 'low' | 'normal' | 'high';

export type ProgressionAction = 'increase_load' | 'add_reps' | 'keep' | 'deload';

export interface ProgressionSuggestion {
  action: ProgressionAction;
  loadKg: number;
  targetReps: number;
  rationale: Rationale;
}

const HARD_RPE = 9;

/**
 * Conservative double progression: add reps within the range, then load once every set reaches
 * the top of the range at a manageable effort. Never increases when fatigue is high.
 */
export function suggestProgression(input: {
  exerciseId: string;
  repsMin: number;
  repsMax: number;
  /** Most recent session last. */
  history: SessionLog[];
  fatigue: FatigueLevel;
}): ProgressionSuggestion {
  const { repsMin, repsMax, history, fatigue } = input;
  const increment = getExercise(input.exerciseId)?.loadIncrementKg ?? 0;
  const last = history.at(-1);
  const make = (action: ProgressionAction, loadKg: number, targetReps: number, reason: string): ProgressionSuggestion => ({
    action,
    loadKg: Math.max(0, Math.round(loadKg * 4) / 4),
    targetReps,
    rationale: {
      goal: 'progression.goal',
      constraints: fatigue === 'high' ? ['progression.constraint.fatigue'] : [],
      dataUsed: ['data.last_sessions', 'data.rpe', 'data.fatigue'],
      reason,
    },
  });

  if (!last || last.sets.length === 0) return make('keep', 0, repsMin, 'progression.reason.no_history');

  const load = Math.max(...last.sets.map((s) => s.loadKg));
  const workSets = last.sets.filter((s) => s.loadKg === load);
  const minReps = Math.min(...workSets.map((s) => s.reps));
  const rpes = workSets.map((s) => s.rpe).filter((r): r is number => r !== undefined);
  const maxRpe = rpes.length > 0 ? Math.max(...rpes) : undefined;

  const failed = (log: SessionLog) => {
    const top = Math.max(...log.sets.map((s) => s.loadKg));
    return log.sets.filter((s) => s.loadKg === top).some((s) => s.reps < repsMin);
  };
  if (history.length >= 2 && failed(last) && failed(history[history.length - 2])) {
    return make('deload', load * 0.9, repsMin, 'progression.reason.two_misses');
  }
  if (fatigue === 'high') return make('keep', load, Math.max(repsMin, minReps), 'progression.reason.fatigue');
  if (minReps < repsMin || (maxRpe !== undefined && maxRpe >= 9.5)) {
    return make('keep', load, repsMin, 'progression.reason.consolidate');
  }
  if (minReps >= repsMax && (maxRpe === undefined || maxRpe <= HARD_RPE) && increment > 0) {
    return make('increase_load', load + increment, repsMin, 'progression.reason.top_of_range');
  }
  if (minReps >= repsMax && increment === 0) {
    return make('add_reps', load, minReps + 1, 'progression.reason.bodyweight');
  }
  return make('add_reps', load, Math.min(repsMax, minReps + 1), 'progression.reason.add_reps');
}
