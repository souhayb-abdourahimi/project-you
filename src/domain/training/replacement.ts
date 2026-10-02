import type { Equipment, TrainingLevel } from '../profile/schemas';
import { EXERCISES, LEVEL_RANK, getExercise, isAvailable, type Exercise } from './exercises';

/**
 * Why an exercise was replaced, as the user said it (closed list, never guessed; same list as the
 * `exercise_substitutions.reason` check, D-031). The first five come from D-028; `dislike` stays
 * for history, new choices use `preference` (a replacement is never read as "hates it", D-031 D).
 * `cant_do` is "je ne connais pas la technique"; `discomfort` never leads to "continue anyway".
 */
export const REPLACEMENT_REASONS = [
  'dislike',
  'cant_do',
  'no_equipment',
  'easier',
  'harder',
  'busy_equipment',
  'discomfort',
  'too_hard_today',
  'no_time',
  'preference',
  'other',
] as const;
export type ReplacementReason = (typeof REPLACEMENT_REASONS)[number];

/** Reasons that remove the current exercise's equipment from the alternatives. */
const EQUIPMENT_MISSING: readonly ReplacementReason[] = ['no_equipment', 'busy_equipment'];
/** Reasons that look for an easier movement (a movement that bothers is never made harder). */
const EASIER: readonly ReplacementReason[] = ['easier', 'cant_do', 'discomfort', 'too_hard_today'];

export interface ReplacementContext {
  equipment: readonly Equipment[];
  level: TrainingLevel;
  refusedExerciseIds: readonly string[];
}

/**
 * Alternatives keeping, as far as possible: muscle group, goal (same pattern), level and equipment.
 * Returns an empty list rather than an unsuitable exercise.
 */
export function findReplacements(exerciseId: string, reason: ReplacementReason, ctx: ReplacementContext): Exercise[] {
  const current = getExercise(exerciseId);
  if (!current) return [];

  let equipment = ctx.equipment;
  if (EQUIPMENT_MISSING.includes(reason)) {
    const missing: readonly Equipment[] = current.equipment.filter((e) => e !== 'bodyweight');
    equipment = ctx.equipment.filter((e) => !missing.includes(e));
  }

  const currentRank = LEVEL_RANK[current.level];
  const userRank = LEVEL_RANK[ctx.level];
  const maxRank = reason === 'harder' ? Math.min(2, Math.max(userRank, currentRank) + 1) : userRank;

  const scored = EXERCISES.filter((e) => {
    if (e.id === current.id || ctx.refusedExerciseIds.includes(e.id)) return false;
    if (!isAvailable(e, equipment)) return false;
    const rank = LEVEL_RANK[e.level];
    if (rank > maxRank) return false;
    if (EASIER.includes(reason)) return rank <= currentRank && (rank < currentRank || e.compound === current.compound);
    if (reason === 'harder') {
      // Harder = a higher level, or the loaded version of a bodyweight movement.
      return rank > currentRank || (rank === currentRank && current.loadIncrementKg === 0 && e.loadIncrementKg > 0);
    }
    return true;
  })
    .map((e) => {
      const samePattern = e.pattern === current.pattern ? 10 : 0;
      const overlap = e.primary.filter((m) => current.primary.includes(m)).length * 3;
      if (samePattern === 0 && overlap === 0) return null;
      let levelScore = -Math.abs(LEVEL_RANK[e.level] - currentRank);
      if (EASIER.includes(reason)) levelScore = currentRank - LEVEL_RANK[e.level];
      if (reason === 'harder') levelScore = LEVEL_RANK[e.level] - currentRank;
      return { e, score: samePattern + overlap + levelScore };
    })
    .filter((x): x is { e: Exercise; score: number } => x !== null);

  return scored.sort((a, b) => b.score - a.score || a.e.id.localeCompare(b.e.id)).map((x) => x.e);
}
