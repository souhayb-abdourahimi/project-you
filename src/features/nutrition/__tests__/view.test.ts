import type { PlannedMeal } from '@/domain/meals/planner';

import { dayIntake } from '../view';

const meal = (status: PlannedMeal['status'], kcal: number, proteinG: number): PlannedMeal =>
  ({
    id: `${status}-${kcal}`,
    status,
    nutrition: { kcal, proteinG, carbsG: 10.4, fatG: 5.2 },
  }) as unknown as PlannedMeal;

describe('dayIntake', () => {
  it('adds only the meals marked eaten, rounded', () => {
    const r = dayIntake([meal('eaten', 500.4, 30.2), meal('eaten', 700.4, 40.4), meal('planned', 900, 50)]);
    expect(r).toEqual({ kcal: 1201, proteinG: 71, carbsG: 21, fatG: 10, eaten: 2, meals: 3 });
  });

  it('a skipped or replaced meal adds nothing (its content is unknown)', () => {
    expect(dayIntake([meal('skipped', 500, 30), meal('replaced', 600, 20)])).toMatchObject({ kcal: 0, eaten: 0 });
  });

  it('no meal plan: zeros, never an invented value', () => {
    expect(dayIntake(null)).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, eaten: 0, meals: 0 });
  });
});
