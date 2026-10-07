import type { Equipment, TrainingLevel } from '../profile/schemas';
import { SESSION_DURATION } from './durations';
import { getExercise, isAvailable } from './exercises';
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
 * Short version (D-034): less time, same intent. It keeps the session's essential exercises in
 * the prescription's order (the main movements come first), with fewer sets and rest capped at
 * 60 s, until the session fits in `minutes`; it never cuts a session after N minutes. A short
 * session is done at home (planning engine, D-019): an exercise that needs equipment the user has
 * not there is swapped for the same movement pattern with the home equipment. A short session
 * counts as a real session.
 */
export function shortSession(
  template: WorkoutTemplate,
  opts: {
    minutes: number;
    equipment: readonly Equipment[];
    level: TrainingLevel;
    refusedExerciseIds: readonly string[];
  },
): AdaptedSession {
  const equipment: Equipment[] = opts.equipment.includes('bodyweight')
    ? [...opts.equipment]
    : ['bodyweight', ...opts.equipment];
  const used = new Set<string>();
  const essentials: PrescribedExercise[] = [];
  for (const e of template.exercises) {
    const current = getExercise(e.exerciseId);
    if (!current) continue;
    const pick = isAvailable(current, equipment)
      ? current
      : candidatesFor(current.pattern, equipment, opts.level, opts.refusedExerciseIds).find((c) => !used.has(c.id));
    if (!pick || used.has(pick.id)) continue;
    used.add(pick.id);
    // A home replacement held in time (plank) is counted in seconds, like the engine does.
    const timed = pick.id !== current.id && pick.id === 'plank' && e.unit === 'reps';
    essentials.push({
      ...e,
      exerciseId: pick.id,
      ...(timed ? { unit: 'seconds' as const, repsMin: 30, repsMax: 40 } : {}),
      restSeconds: Math.min(e.restSeconds, SESSION_DURATION.shortRestSeconds),
      alternatives: [],
    });
  }
  const fits = (list: PrescribedExercise[]) =>
    estimateMinutes(list, SESSION_DURATION.shortWarmUpMinutes) <= opts.minutes;
  // Add essentials with two sets each (one if the prescription has one) while they fit...
  const exercises: PrescribedExercise[] = [];
  for (const e of essentials) {
    const next = [...exercises, { ...e, sets: Math.min(2, e.sets) }];
    if (exercises.length > 0 && !fits(next)) break;
    exercises.push(next.at(-1)!);
  }
  // ...then give the first ones back a set (up to three, never more than prescribed) while there is time.
  for (let grew = true; grew;) {
    grew = false;
    for (let i = 0; i < exercises.length; i++) {
      const e = exercises[i];
      const original = essentials.find((x) => x.exerciseId === e.exerciseId)!;
      if (e.sets >= Math.min(3, original.sets)) continue;
      const next = exercises.map((x, j) => (j === i ? { ...x, sets: x.sets + 1 } : x));
      if (!fits(next)) continue;
      exercises[i] = next[i];
      grew = true;
    }
  }
  // Even the first exercise alone does not fit: keep it with as few sets as possible.
  while (exercises.length === 1 && exercises[0].sets > 1 && !fits(exercises)) {
    exercises[0] = { ...exercises[0], sets: exercises[0].sets - 1 };
  }
  return {
    variant: 'short',
    exercises,
    estimatedMinutes: Math.min(opts.minutes, estimateMinutes(exercises, SESSION_DURATION.shortWarmUpMinutes)),
    atHome: true,
  };
}

/**
 * Light version (D-034): less effort, same session. Same exercises in the same order, about 40 %
 * fewer sets and a target effort capped at RPE 6. The time saved is a consequence, not the goal.
 */
export function lightSession(template: WorkoutTemplate): AdaptedSession {
  const exercises = template.exercises.map((e) => ({
    ...e,
    sets: Math.max(1, Math.round(e.sets * 0.6)),
    targetRpe: Math.min(e.targetRpe, 6),
  }));
  return { variant: 'light', exercises, estimatedMinutes: estimateMinutes(exercises), atHome: false };
}
