/**
 * Reference weight for the nutrition targets (docs/ADAPTATION_ENGINE.md §4). The onboarding weight
 * does not serve forever, but a single weigh-in changes nothing: every 14 days from the start, a
 * recent average with enough weigh-ins may replace it when it moved by at least 1 kg. Replayed from
 * the weigh-in log, so two devices get the same basis without storing anything.
 */
import type { NutritionTargets } from '../nutrition/engine';
import { addDays, daysBetween, type IsoDate } from '../shared/dates';

export const WEIGHT_BASIS = {
  checkpointDays: 14,
  minEntries: 4,
  minChangeKg: 1,
  roundKg: 0.5,
} as const;

export interface WeightBasis {
  weightKg: number;
  /** Checkpoint from which this basis applies; null while the profile weight stands. */
  since: IsoDate | null;
}

const avg = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;
const roundTo = (v: number, step: number) => Math.round(v / step) * step;

/**
 * `frozen`: a safety rule is active (fast weight loss or low intake). The basis then never goes down
 * (a lower basis would mean fewer calories); a higher one is still applied.
 */
export function weightBasis(input: {
  startedOn: IsoDate;
  today: IsoDate;
  profileWeightKg: number;
  weights: { date: IsoDate; weightKg: number }[];
  frozen: boolean;
}): WeightBasis {
  let basis: WeightBasis = { weightKg: input.profileWeightKg, since: null };
  const checkpoints = Math.floor(Math.max(0, daysBetween(input.startedOn, input.today)) / WEIGHT_BASIS.checkpointDays);
  for (let i = 1; i <= checkpoints; i++) {
    const at = addDays(input.startedOn, i * WEIGHT_BASIS.checkpointDays);
    const inLast = (days: number) =>
      input.weights.filter((w) => w.date > addDays(at, -days) && w.date <= at).map((w) => w.weightKg);
    const fortnight = inLast(14);
    if (fortnight.length < WEIGHT_BASIS.minEntries) continue;
    const week = inLast(7);
    const candidate = roundTo(avg(week.length >= 2 ? week : fortnight), WEIGHT_BASIS.roundKg);
    if (Math.abs(candidate - basis.weightKg) < WEIGHT_BASIS.minChangeKg) continue;
    if (input.frozen && candidate < basis.weightKg) continue;
    basis = { weightKg: candidate, since: at };
  }
  return basis;
}

/**
 * Applies an accepted calorie offset (Adaptation Engine, `adjustments`) on top of the targets:
 * carbohydrates absorb the change, and the result never goes below the floor (BMR, D-022).
 */
/** The lowest daily target an adaptation may reach: the floor, and no deficit for a protected profile. */
export function minimumKcal(
  targets: Pick<NutritionTargets, 'calories' | 'floorKcal' | 'maintenance'>,
  noDeficit: boolean,
): number {
  return noDeficit
    ? Math.max(targets.floorKcal, Math.min(targets.calories, Math.round(targets.maintenance)))
    : targets.floorKcal;
}

export function withCalorieOffset(targets: NutritionTargets, offsetKcal: number, noDeficit = false): NutritionTargets {
  if (offsetKcal === 0) return targets;
  const calories = Math.max(minimumKcal(targets, noDeficit), targets.calories + offsetKcal);
  const delta = calories - targets.calories;
  return {
    ...targets,
    calories,
    carbsG: Math.max(0, Math.round(targets.carbsG + delta / 4)),
    rationale: { ...targets.rationale, params: { ...targets.rationale.params, adaptedKcal: delta } },
  };
}
