import { computeNutritionTargets } from '../../nutrition/engine';
import type { Allergen, Diet, UserContextSnapshot } from '../../profile/schemas';
import { SCENARIOS, scenario } from '../../scenarios';
import { constraintsFrom } from '../constraints';
import {
  ENERGY_GAP_RATIO,
  energyCoverage,
  planWeek,
  replaceMealInPlan,
  type DailyMealPlan,
  type PlannerContext,
} from '../planner';

/** Review B1: an incomplete plan never shows a dangerously low day without a clear warning (D-022). */

const WEEK = '2026-09-28';

function ctxFor(s: UserContextSnapshot): PlannerContext {
  return {
    targets: computeNutritionTargets(s, 2026),
    constraints: constraintsFrom(s.nutrition, s.lifestyle.kitchen),
    preferences: s.nutrition,
    inventory: [],
    today: '2026-09-30',
  };
}

function withProfile(
  base: UserContextSnapshot,
  user: Partial<UserContextSnapshot['user']>,
  nutrition: Partial<UserContextSnapshot['nutrition']>,
) {
  return scenario({ ...base, user: { ...base.user, ...user }, nutrition: { ...base.nutrition, ...nutrition } });
}

/** The invariant of B1, checked on every day of a plan. */
function expectNoSilentLowDay(day: DailyMealPlan, label: string) {
  const e = day.energy;
  if (e.floorKcal !== null && day.totals.kcal < e.floorKcal) {
    expect({ label, date: day.date, warned: e.incomplete && e.belowFloor }).toEqual({
      label,
      date: day.date,
      warned: true,
    });
  }
  if (e.incomplete) {
    expect(e.missingKcal).toBeGreaterThan(0);
    expect(Math.abs(e.missingKcal - (day.targetKcal - day.totals.kcal))).toBeLessThanOrEqual(50);
  }
}

describe('energy coverage of a day', () => {
  const targets = { calories: 2000, proteinG: 120, floorKcal: 1400 };

  it('computes the planned energy, the gap and rounds it up to 50 kcal', () => {
    expect(energyCoverage(1530, targets, ['breakfast'])).toEqual({
      plannedKcal: 1530,
      missingKcal: 500,
      floorKcal: 1400,
      missingSlots: ['breakfast'],
      belowFloor: false,
      incomplete: true,
    });
  });

  it('always warns under the floor, even without an impossible meal', () => {
    expect(energyCoverage(1300, targets, [])).toMatchObject({ belowFloor: true, incomplete: true, missingKcal: 700 });
  });

  it('stays quiet when the other meals absorbed the missing one', () => {
    expect(energyCoverage(2000 * (1 - ENERGY_GAP_RATIO) + 1, targets, ['breakfast']).incomplete).toBe(false);
    expect(energyCoverage(2000, targets, ['breakfast'])).toMatchObject({ missingKcal: 0, incomplete: false });
  });

  it('exposes a floor between the BMR and the target', () => {
    for (const s of Object.values(SCENARIOS)) {
      const t = computeNutritionTargets(s, 2026);
      expect(t.floorKcal).toBeLessThanOrEqual(t.calories);
      expect(t.floorKcal).toBeGreaterThanOrEqual(Math.min(t.bmr, t.calories));
    }
  });
});

describe('vegan with a soy allergy (regression)', () => {
  it('redistributes the impossible breakfast over the other meals (scenario veganSoyAllergy)', () => {
    const ctx = ctxFor(SCENARIOS.veganSoyAllergy);
    const plan = planWeek(WEEK, ctx);
    for (const day of plan.days) {
      expect(day.energy.missingSlots).toEqual(['breakfast']);
      expect(day.meals).toHaveLength(2);
      expect(Math.abs(day.totals.kcal / ctx.targets.calories - 1)).toBeLessThan(ENERGY_GAP_RATIO);
      expect(day.energy.incomplete).toBe(false);
      for (const meal of day.meals) expect(meal.servings).toBeLessThanOrEqual(2.5);
    }
  });

  it('warns with the missing energy when redistribution is not enough (scenario veganSoyAllergySmall)', () => {
    const ctx = ctxFor(SCENARIOS.veganSoyAllergySmall);
    const plan = planWeek(WEEK, ctx);
    for (const day of plan.days) {
      // Before the fix: lunch alone at its 37.5 % share, about 660 kcal for a 1 850 kcal target.
      expect(day.totals.kcal).toBeGreaterThan(ctx.targets.calories * 0.375 * 1.5);
      expect(day.energy.incomplete).toBe(true);
      expect(day.energy.missingKcal).toBe(550);
      for (const meal of day.meals) expect(meal.servings).toBeLessThanOrEqual(2.5);
      expectNoSilentLowDay(day, 'veganSoyAllergySmall');
    }
  });

  it.each([
    ['female', 1210],
    ['male', 1500],
  ] as const)('never shows a %s 50 kg day under the floor without the warning', (sex, floor) => {
    const s = withProfile(SCENARIOS.veganSoyAllergySmall, { sex }, {});
    const ctx = ctxFor(s);
    expect(ctx.targets.floorKcal).toBe(floor);
    for (const day of planWeek(WEEK, ctx).days) expectNoSilentLowDay(day, sex);
  });

  it('keeps the warning when a meal is replaced', () => {
    const plan = planWeek(WEEK, ctxFor(SCENARIOS.veganSoyAllergySmall));
    const meal = plan.days[0].meals[0];
    const next = replaceMealInPlan(plan, { ...meal, servings: 1 });
    expect(next.days[0].energy).toMatchObject({
      incomplete: true,
      floorKcal: 1210,
      missingSlots: ['breakfast', 'dinner'],
    });
  });
});

describe('no silent low day, across constraint combinations', () => {
  const diets: Diet[] = ['omnivore', 'vegetarian', 'vegan'];
  const allergySets: Allergen[][] = [[], ['soy'], ['soy', 'gluten']];
  const people: Partial<UserContextSnapshot['user']>[] = [
    { weightKg: 50, heightCm: 157, sex: 'female' },
    { weightKg: 50, heightCm: 170, sex: 'male' },
    { weightKg: 92, heightCm: 168, sex: 'female' },
  ];

  it('warns on every day under the floor or left short by an impossible meal', () => {
    for (const diet of diets)
      for (const allergies of allergySets)
        for (const user of people)
          for (const cookingMinutes of [10, 30])
            for (const mealsPerDay of [2, 3, 5]) {
              const s = withProfile(SCENARIOS.fatLoss, user, { diet, allergies, cookingMinutes, mealsPerDay });
              const label = `${diet} ${allergies.join('+')} ${user.sex} ${user.weightKg}kg ${cookingMinutes}min ${mealsPerDay}`;
              for (const day of planWeek(WEEK, ctxFor(s)).days) {
                expectNoSilentLowDay(day, label);
                if (day.energy.missingSlots.length > 0 && day.totals.kcal <= day.targetKcal * (1 - ENERGY_GAP_RATIO)) {
                  expect({ label, warned: day.energy.incomplete }).toEqual({ label, warned: true });
                }
              }
            }
  });
});
