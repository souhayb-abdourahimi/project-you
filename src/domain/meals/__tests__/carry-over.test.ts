import { computeNutritionTargets } from '../../nutrition/engine';
import { SCENARIOS } from '../../scenarios';
import { constraintsFrom } from '../constraints';
import { carryOverEaten, planWeek } from '../planner';

const WEEK = '2026-09-28';

function plan(mealsPerDay: number) {
  const s = SCENARIOS.studentMediumBudget;
  const nutrition = { ...s.nutrition, mealsPerDay };
  return planWeek(WEEK, {
    targets: computeNutritionTargets({ ...s, nutrition }, 2026),
    constraints: constraintsFrom(nutrition, s.lifestyle.kitchen),
    preferences: nutrition,
    inventory: [],
    today: WEEK,
  });
}

describe('carryOverEaten', () => {
  it('keeps an eaten dinner when the number of meals per day changes', () => {
    const before = plan(3);
    const dinner = before.days[0].meals.find((m) => m.slot === 'dinner')!;
    const eatenBefore = {
      ...before,
      days: before.days.map((d, i) =>
        i === 0 ? { ...d, meals: d.meals.map((m) => (m === dinner ? { ...m, status: 'eaten' as const } : m)) } : d,
      ),
    };
    const after = carryOverEaten(plan(4), eatenBefore);
    const kept = after.days[0].meals.find((m) => m.slot === 'dinner')!;
    expect(kept.status).toBe('eaten');
    expect(kept.recipeId).toBe(dinner.recipeId);
    expect(after.days[0].meals.filter((m) => m.slot === 'dinner')).toHaveLength(1);
  });

  it('ignores a plan from another week', () => {
    const next = plan(3);
    expect(carryOverEaten(next, { ...next, weekStart: '2026-09-21' })).toBe(next);
  });
});
