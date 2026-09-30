import { computeNutritionTargets } from '../../nutrition/engine';
import type { UserContextSnapshot } from '../../profile/schemas';
import { SCENARIOS, scenario } from '../../scenarios';
import { getFood } from '../catalog';
import { constraintsFrom, isFoodAllowed } from '../constraints';
import type { InventoryItem } from '../inventory';
import { planWeek, type PlannerContext, type WeeklyMealPlan } from '../planner';

/** Regression suite for "vegan demo plans stay under the protein target" (TODO, 2026-09-30). */

const WEEK = '2026-09-28';

function ctxFor(s: UserContextSnapshot, inventory: InventoryItem[] = []): PlannerContext {
  return {
    targets: computeNutritionTargets(s, 2026),
    constraints: constraintsFrom(s.nutrition, s.lifestyle.kitchen),
    preferences: s.nutrition,
    inventory,
    today: '2026-09-30',
  };
}

function expectCompliant(s: UserContextSnapshot, plan: WeeklyMealPlan) {
  const c = constraintsFrom(s.nutrition, s.lifestyle.kitchen);
  for (const day of plan.days)
    for (const meal of day.meals)
      for (const i of meal.ingredients) expect(isFoodAllowed(getFood(i.foodId)!, c)).toBe(true);
}

const CASES: [string, UserContextSnapshot][] = [
  ['vegan (peanut allergy)', SCENARIOS.vegan],
  ['vegan fat loss (high protein target)', SCENARIOS.veganFatLoss],
  ['vegan muscle gain', SCENARIOS.veganMuscleGain],
  ['omnivore fat loss', SCENARIOS.fatLoss],
  ['recomposition', SCENARIOS.recomposition],
  ['multiple allergies', SCENARIOS.multipleAllergies],
  ['low budget, microwave only', SCENARIOS.studentLowBudget],
];

describe.each(CASES)('protein target — %s', (_label, s) => {
  const ctx = ctxFor(s);
  const plan = planWeek(WEEK, ctx);

  it('respects diet, allergies and exclusions', () => expectCompliant(s, plan));

  it('plans every meal slot of every day', () => {
    for (const day of plan.days) expect(day.meals).toHaveLength(ctx.preferences.mealsPerDay);
  });

  it('reaches at least 90 % of the protein target each day and reports it', () => {
    for (const day of plan.days) {
      expect(day.protein.targetG).toBe(ctx.targets.proteinG);
      expect(day.totals.proteinG).toBeGreaterThanOrEqual(ctx.targets.proteinG * 0.9);
      expect(day.protein.met).toBe(true);
    }
  });

  it('stays within 15 % of the calorie target', () => {
    for (const day of plan.days) expect(Math.abs(day.totals.kcal / ctx.targets.calories - 1)).toBeLessThan(0.15);
  });
});

describe('limited inventory', () => {
  it('still uses what is at home without sacrificing the protein target', () => {
    const s = SCENARIOS.veganFatLoss;
    const inventory: InventoryItem[] = [
      { foodId: 'lentils', quantity: 500 },
      { foodId: 'rice', quantity: 1000 },
    ].map(({ foodId, quantity }) => ({
      id: `inv-${foodId}`,
      foodId,
      name: foodId,
      quantity,
      unit: 'g',
      category: 'x',
      expiresOn: null,
      source: 'manual',
      addedAt: '2026-09-30',
      updatedAt: '2026-09-30',
    }));
    const plan = planWeek(WEEK, ctxFor(s, inventory));
    const ids = plan.days.flatMap((d) => d.meals.flatMap((m) => m.ingredients.map((i) => i.foodId)));
    expect(ids).toContain('lentils');
    for (const day of plan.days) expect(day.protein.met).toBe(true);
  });
});

describe('unreachable target', () => {
  it('says so honestly instead of hiding the gap', () => {
    // Vegan with soy and gluten allergies: the MOCK catalogue has no dense protein source left.
    const s = scenario({
      ...SCENARIOS.veganFatLoss,
      nutrition: { ...SCENARIOS.veganFatLoss.nutrition, allergies: ['soy', 'gluten'] },
    });
    const ctx = ctxFor(s);
    const plan = planWeek(WEEK, ctx);
    expectCompliant(s, plan);
    const short = plan.days.filter((d) => d.totals.proteinG < ctx.targets.proteinG * 0.9);
    for (const day of short) {
      expect(day.protein.met).toBe(false);
      expect(day.protein.plannedG).toBe(Math.round(day.totals.proteinG));
    }
  });
});
