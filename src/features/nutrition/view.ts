/**
 * View model of the Nutrition screen (W-9 §6): what the meals marked as eaten add up to, with their
 * planned values (the same estimate as the meal cards). A meal skipped or replaced by something
 * else adds nothing: its real content is unknown, never guessed.
 */
import type { PlannedMeal } from '@/domain/meals/planner';

export interface DayIntake {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Meals marked eaten, over the meals of the day. */
  eaten: number;
  meals: number;
}

export function dayIntake(meals: readonly PlannedMeal[] | null | undefined): DayIntake {
  const list = meals ?? [];
  const eaten = list.filter((m) => m.status === 'eaten');
  const sum = (pick: (m: PlannedMeal) => number) => Math.round(eaten.reduce((s, m) => s + pick(m), 0));
  return {
    kcal: sum((m) => m.nutrition.kcal),
    proteinG: sum((m) => m.nutrition.proteinG),
    carbsG: sum((m) => m.nutrition.carbsG),
    fatG: sum((m) => m.nutrition.fatG),
    eaten: eaten.length,
    meals: list.length,
  };
}
