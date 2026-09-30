import type { Equipment, GoalType, TrainingLevel, TrainingProfile } from '../profile/schemas';
import { clamp } from '../shared/math';
import type { Rationale } from '../shared/rationale';
import { EXERCISES, LEVEL_RANK, isAvailable, type Exercise, type MovementPattern } from './exercises';

export type SessionFocus = 'full_a' | 'full_b' | 'upper' | 'lower';
export type SetUnit = 'reps' | 'seconds';

export interface PrescribedExercise {
  exerciseId: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  unit: SetUnit;
  restSeconds: number;
  targetRpe: number;
  alternatives: string[];
}

export interface WorkoutTemplate {
  index: number;
  focus: SessionFocus;
  exercises: PrescribedExercise[];
  estimatedMinutes: number;
}

export interface WorkoutPlan {
  engineVersion: 1;
  sessions: WorkoutTemplate[];
  rationale: Rationale;
}

export interface WorkoutInput {
  goal: GoalType;
  training: Pick<
    TrainingProfile,
    'level' | 'sessionsPerWeek' | 'sessionMinutes' | 'equipment' | 'refusedExerciseIds'
  >;
}

const FOCUS_PATTERNS: Record<SessionFocus, MovementPattern[]> = {
  full_a: ['squat', 'push_horizontal', 'pull_horizontal', 'hinge', 'push_vertical', 'pull_vertical', 'core', 'arms'],
  full_b: ['hinge', 'push_vertical', 'pull_vertical', 'lunge', 'push_horizontal', 'pull_horizontal', 'core', 'arms'],
  upper: ['push_horizontal', 'pull_horizontal', 'push_vertical', 'pull_vertical', 'arms', 'arms', 'core', 'push_horizontal'],
  lower: ['squat', 'hinge', 'lunge', 'core', 'hinge', 'squat', 'core', 'lunge'],
};

const SPLITS: Record<number, SessionFocus[]> = {
  1: ['full_a'],
  2: ['full_a', 'full_b'],
  3: ['full_a', 'full_b', 'full_a'],
  4: ['upper', 'lower', 'upper', 'lower'],
  5: ['upper', 'lower', 'full_a', 'upper', 'lower'],
  6: ['upper', 'lower', 'upper', 'lower', 'upper', 'lower'],
};

const TIME_BASED = new Set(['plank']);

interface Prescription {
  sets: number;
  repsMin: number;
  repsMax: number;
  restSeconds: number;
}

function prescriptionFor(goal: GoalType, compound: boolean, level: TrainingLevel): Prescription {
  let p: Prescription;
  if (goal === 'performance') {
    p = compound ? { sets: 4, repsMin: 4, repsMax: 6, restSeconds: 150 } : { sets: 3, repsMin: 8, repsMax: 10, restSeconds: 90 };
  } else if (goal === 'muscle_gain' || goal === 'recomposition') {
    p = compound ? { sets: 3, repsMin: 6, repsMax: 10, restSeconds: 120 } : { sets: 3, repsMin: 10, repsMax: 12, restSeconds: 75 };
  } else {
    p = compound ? { sets: 3, repsMin: 8, repsMax: 12, restSeconds: 90 } : { sets: 2, repsMin: 12, repsMax: 15, restSeconds: 60 };
  }
  if (level === 'beginner') {
    // Beginners: fewer sets and moderate reps to learn the movements safely.
    p = { ...p, sets: Math.min(p.sets, 3), repsMin: Math.max(p.repsMin, 8), repsMax: Math.max(p.repsMax, 12) };
  }
  return p;
}

/** Warm-up plus working sets and rests, in minutes. */
export function estimateMinutes(exercises: Pick<PrescribedExercise, 'sets' | 'restSeconds'>[]): number {
  const WARM_UP = 8;
  const SET_SECONDS = 45;
  const seconds = exercises.reduce((s, e) => s + e.sets * (SET_SECONDS + e.restSeconds), 0);
  return Math.round(WARM_UP + seconds / 60);
}

export function exerciseCountFor(minutes: number, level: TrainingLevel): number {
  const count = clamp(Math.floor((minutes - 8) / 9), 2, 8);
  return level === 'beginner' ? Math.min(count, 6) : count;
}

/** Candidates for a pattern, most suitable first (closest to the user's level, then id for determinism). */
export function candidatesFor(
  pattern: MovementPattern,
  equipment: readonly Equipment[],
  level: TrainingLevel,
  refused: readonly string[],
): Exercise[] {
  const rank = LEVEL_RANK[level];
  return EXERCISES.filter(
    (e) => e.pattern === pattern && isAvailable(e, equipment) && LEVEL_RANK[e.level] <= rank && !refused.includes(e.id),
  ).sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || a.id.localeCompare(b.id));
}

export function generateWorkoutPlan(input: WorkoutInput): WorkoutPlan {
  const { training, goal } = input;
  const split = SPLITS[clamp(training.sessionsPerWeek, 1, 6)];
  const count = exerciseCountFor(training.sessionMinutes, training.level);
  const occurrences = new Map<SessionFocus, number>();

  const sessions = split.map((focus, index) => {
    const occurrence = occurrences.get(focus) ?? 0;
    occurrences.set(focus, occurrence + 1);
    const used = new Set<string>();
    const exercises: PrescribedExercise[] = [];

    for (const pattern of FOCUS_PATTERNS[focus]) {
      if (exercises.length >= count) break;
      const options = candidatesFor(pattern, training.equipment, training.level, training.refusedExerciseIds).filter(
        (e) => !used.has(e.id),
      );
      if (options.length === 0) continue;
      // Rotate variations between repeated sessions of the same focus.
      const pick = options[occurrence % options.length];
      used.add(pick.id);
      const p = prescriptionFor(goal, pick.compound, training.level);
      const timeBased = TIME_BASED.has(pick.id);
      exercises.push({
        exerciseId: pick.id,
        sets: p.sets,
        repsMin: timeBased ? 30 : p.repsMin,
        repsMax: timeBased ? 45 : p.repsMax,
        unit: timeBased ? 'seconds' : 'reps',
        restSeconds: p.restSeconds,
        targetRpe: training.level === 'beginner' ? 7 : 8,
        alternatives: options.filter((o) => o.id !== pick.id).slice(0, 2).map((o) => o.id),
      });
    }

    // Trim accessories if the prescription does not fit the available time.
    while (exercises.length > 2 && estimateMinutes(exercises) > training.sessionMinutes) exercises.pop();
    return { index, focus, exercises, estimatedMinutes: estimateMinutes(exercises) };
  });

  return {
    engineVersion: 1,
    sessions,
    rationale: {
      goal: `goal.${goal}`,
      constraints: ['training.constraint.equipment', 'training.constraint.duration', 'training.constraint.refused'],
      dataUsed: ['data.level', 'data.frequency', 'data.duration', 'data.equipment'],
      reason: 'training.reason.split',
      params: { sessions: split.length, minutes: training.sessionMinutes },
    },
  };
}
