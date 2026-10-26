/**
 * View model of the Nutrition screen (W-9 §6): what the meals marked as eaten add up to, with their
 * planned values (the same estimate as the meal cards). A meal skipped or replaced by something
 * else adds nothing: its real content is unknown, never guessed.
 */
import type { LoggedMeal } from '@/domain/meals/photo-analysis';
import type { PlannedMeal } from '@/domain/meals/planner';

export interface DayIntake {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Meals marked eaten, over the meals of the day. */
  eaten: number;
  meals: number;
  /** Meals added outside the plan (W-10, confirmed estimates): counted in the totals. */
  added: number;
}

export function dayIntake(
  meals: readonly PlannedMeal[] | null | undefined,
  added: readonly Pick<LoggedMeal, 'nutrition'>[] = [],
): DayIntake {
  const list = meals ?? [];
  const known = [...list.filter((m) => m.status === 'eaten').map((m) => m.nutrition), ...added.map((m) => m.nutrition)];
  const sum = (pick: (n: (typeof known)[number]) => number) => Math.round(known.reduce((s, n) => s + pick(n), 0));
  return {
    kcal: sum((n) => n.kcal),
    proteinG: sum((n) => n.proteinG),
    carbsG: sum((n) => n.carbsG),
    fatG: sum((n) => n.fatG),
    eaten: list.filter((m) => m.status === 'eaten').length,
    meals: list.length,
    added: added.length,
  };
}
