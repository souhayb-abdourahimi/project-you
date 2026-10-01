import type { DailyMealPlan } from './meals/planner';
import type { PlannedDay } from './planning/engine';

export type NextAction =
  | { kind: 'start_workout'; sessionIndex: number; start: string | null }
  | { kind: 'eat_meal'; mealId: string }
  | { kind: 'log_weight' }
  | { kind: 'rest' };

export interface TodayState {
  day: PlannedDay | null;
  meals: DailyMealPlan | null;
  workoutDone: boolean;
  weightLoggedThisWeek: boolean;
  /** Current local time `HH:MM`. */
  now: string;
}

/** Answers "Qu'est-ce que je dois faire maintenant ?" with a single primary action. */
export function nextAction(state: TodayState): NextAction {
  const workout = state.day?.items.find((i) => i.kind === 'workout');
  const pendingMeals = state.meals?.meals.filter((m) => m.status === 'planned') ?? [];

  if (workout && workout.kind === 'workout' && !state.workoutDone) {
    const workoutIsSoon = workout.start === null || workout.start <= addHour(state.now);
    if (workoutIsSoon || pendingMeals.length === 0) {
      return { kind: 'start_workout', sessionIndex: workout.sessionIndex, start: workout.start };
    }
  }
  if (pendingMeals.length > 0) return { kind: 'eat_meal', mealId: pendingMeals[0].id };
  if (!state.weightLoggedThisWeek) return { kind: 'log_weight' };
  return { kind: 'rest' };
}

function addHour(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return `${String(Math.min(23, h + 1)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
