import type { Equipment, TrainingLevel } from '../profile/schemas';
import { getExercise } from './exercises';
import { candidatesFor, estimateMinutes, type PrescribedExercise, type WorkoutTemplate } from './engine';

export type SessionVariant = 'full' | 'short' | 'light';

export interface AdaptedSession {
  variant: SessionVariant;
  exercises: PrescribedExercise[];
  estimatedMinutes: number;
  /** Home version: no equipment beyond what the user has at home. */
  atHome: boolean;
}

/**
 * "J'ai 15 minutes": a short circuit built from the session's movement patterns, using only
 * the given equipment (bodyweight at minimum). A short session counts as a real session.
 */
export function shortSession(
  template: WorkoutTemplate,
  opts: { minutes: number; equipment: readonly Equipment[]; level: TrainingLevel; refusedExerciseIds: readonly string[] },
): AdaptedSession {
  const equipment: Equipment[] = opts.equipment.includes('bodyweight') ? [...opts.equipment] : ['bodyweight', ...opts.equipment];
  const patterns = [...new Set(template.exercises.map((e) => getExercise(e.exerciseId)?.pattern).filter(Boolean))];
  const maxExercises = opts.minutes <= 15 ? 3 : 4;
  const used = new Set<string>();
  const exercises: PrescribedExercise[] = [];

  for (const pattern of patterns) {
    if (exercises.length >= maxExercises || !pattern) break;
    const pick = candidatesFor(pattern, equipment, opts.level, opts.refusedExerciseIds).find((e) => !used.has(e.id));
    if (!pick) continue;
    used.add(pick.id);
    const timeBased = pick.id === 'plank';
    exercises.push({
      exerciseId: pick.id,
      sets: opts.minutes <= 15 ? 2 : 3,
      repsMin: timeBased ? 30 : 10,
      repsMax: timeBased ? 40 : 15,
      unit: timeBased ? 'seconds' : 'reps',
      restSeconds: 30,
      targetRpe: 7,
      alternatives: [],
    });
  }

  return { variant: 'short', exercises, estimatedMinutes: Math.min(opts.minutes, estimateMinutes(exercises)), atHome: true };
}

/** "Version allégée": same exercises, ~40 % fewer sets, lower effort. */
export function lightSession(template: WorkoutTemplate): AdaptedSession {
  const exercises = template.exercises.map((e) => ({
    ...e,
    sets: Math.max(1, Math.round(e.sets * 0.6)),
    targetRpe: Math.min(e.targetRpe, 6),
  }));
  return { variant: 'light', exercises, estimatedMinutes: estimateMinutes(exercises), atHome: false };
}
