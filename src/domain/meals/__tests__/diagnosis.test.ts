import { computeNutritionTargets } from '../../nutrition/engine';
import type { Allergen, Diet, UserContextSnapshot } from '../../profile/schemas';
import { SCENARIOS, scenario } from '../../scenarios';
import { constraintsFrom } from '../constraints';
import { diagnosePlan, planWeekWithDiagnosis, type Adjustment, type PlanDiagnosis } from '../diagnosis';
import { PROTEIN_MET_RATIO, planWeek, type PlannerContext } from '../planner';

/** Review C2: a plan that cannot be completed is always explained, with measured suggestions (D-021). */

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

function withNutrition(base: UserContextSnapshot, nutrition: Partial<UserContextSnapshot['nutrition']>) {
  return scenario({ ...base, nutrition: { ...base.nutrition, ...nutrition } });
}

/** Applies one suggestion to the profile, as the user would. */
function apply(s: UserContextSnapshot, a: Adjustment): UserContextSnapshot {
  switch (a.kind) {
    case 'allow_excluded_food':
      return withNutrition(s, { excludedFoods: s.nutrition.excludedFoods.filter((f) => f !== a.input) });
    case 'more_cooking_time':
      return withNutrition(s, { cookingMinutes: a.minutes });
    case 'kitchen_equipment':
      return scenario({ ...s, lifestyle: { ...s.lifestyle, kitchen: [...s.lifestyle.kitchen, ...a.equipment] } });
    case 'meals_per_day':
      return withNutrition(s, { mealsPerDay: a.mealsPerDay });
    case 'lower_protein_target':
      return s;
  }
}

const incomplete = (s: UserContextSnapshot) =>
  planWeek(WEEK, ctxFor(s)).days.some((d) => d.meals.length < s.nutrition.mealsPerDay);

describe('vegan with a soy allergy (scenario veganSoyAllergy)', () => {
  const s = SCENARIOS.veganSoyAllergy;
  const plan = planWeekWithDiagnosis(WEEK, ctxFor(s));
  const d = plan.diagnosis as PlanDiagnosis;

  it('is explained instead of leaving meals out silently', () => {
    expect(incomplete(s)).toBe(true);
    expect(d).not.toBeNull();
    expect(d.missingSlots).toContain('breakfast');
  });

  it('names the blocking constraints', () => {
    expect(d.blockers).toContainEqual({ kind: 'allergy', allergen: 'soy' });
    expect(d.blockers).toContainEqual({ kind: 'diet', diet: 'vegan' });
  });

  it('never suggests dropping an allergy or the diet', () => {
    const kinds = d.adjustments.map((a) => a.kind);
    expect(kinds.length).toBeGreaterThan(0);
    expect(
      kinds.every((k) =>
        [
          'meals_per_day',
          'lower_protein_target',
          'more_cooking_time',
          'kitchen_equipment',
          'allow_excluded_food',
        ].includes(k),
      ),
    ).toBe(true);
  });

  it('only suggests changes that fill the missing meals', () => {
    for (const a of d.adjustments.filter((x) => x.kind !== 'lower_protein_target')) {
      expect({ a, incomplete: incomplete(apply(s, a)) }).toEqual({ a, incomplete: false });
    }
  });
});

describe('suggestions', () => {
  it('offers to allow an excluded food again, but never an intolerance', () => {
    const excluded = withNutrition(SCENARIOS.veganFatLoss, { excludedFoods: ['soja'] });
    const intolerant = withNutrition(SCENARIOS.veganFatLoss, { intolerances: ['soja'] });
    const de = diagnosePlan(planWeek(WEEK, ctxFor(excluded)), ctxFor(excluded))!;
    const di = diagnosePlan(planWeek(WEEK, ctxFor(intolerant)), ctxFor(intolerant))!;
    expect(de.adjustments).toContainEqual({ kind: 'allow_excluded_food', input: 'soja' });
    expect(di.blockers).toContainEqual({ kind: 'exclusion', input: 'soja', source: 'intolerance' });
    expect(di.adjustments.some((a) => a.kind === 'allow_excluded_food')).toBe(false);
  });

  it('points at a too short cooking time and checks that more time fills the plan', () => {
    const s = withNutrition(SCENARIOS.fatLoss, { cookingMinutes: 5 });
    const d = diagnosePlan(planWeek(WEEK, ctxFor(s)), ctxFor(s))!;
    expect(d.blockers).toContainEqual({ kind: 'cooking_time', minutes: 5 });
    const more = d.adjustments.find((a) => a.kind === 'more_cooking_time')!;
    expect(more).toBeDefined();
    expect(incomplete(apply(s, more))).toBe(false);
  });

  it('only offers a slightly lower protein target, close to what the plan reaches', () => {
    for (const s of [SCENARIOS.veganSoyAllergy, withNutrition(SCENARIOS.fatLoss, { cookingMinutes: 5 })]) {
      const ctx = ctxFor(s);
      const d = diagnosePlan(planWeek(WEEK, ctx), ctx)!;
      const lower = d.adjustments.find((a) => a.kind === 'lower_protein_target');
      if (lower) expect(lower.reachableProteinG).toBeGreaterThanOrEqual(ctx.targets.proteinG * 0.75);
    }
  });

  it('has nothing to explain when the plan is complete and meets the protein target', () => {
    for (const s of [SCENARIOS.fatLoss, SCENARIOS.veganFatLoss, SCENARIOS.studentLowBudget]) {
      expect(planWeekWithDiagnosis(WEEK, ctxFor(s)).diagnosis).toBeNull();
    }
  });
});

describe('no unexplained empty meal, across constraint combinations', () => {
  const diets: Diet[] = ['omnivore', 'vegetarian', 'vegan'];
  const allergySets: Allergen[][] = [[], ['soy'], ['soy', 'gluten'], ['gluten', 'milk', 'nuts']];
  const cases = diets.flatMap((diet) =>
    allergySets.flatMap((allergies) =>
      [10, 30].flatMap((cookingMinutes) =>
        [2, 3, 5].map((mealsPerDay) =>
          withNutrition(SCENARIOS.fatLoss, { diet, allergies, cookingMinutes, mealsPerDay }),
        ),
      ),
    ),
  );

  it('explains every incomplete or protein-short plan', () => {
    for (const s of cases) {
      const ctx = ctxFor(s);
      const plan = planWeekWithDiagnosis(WEEK, ctx);
      const missing = plan.days.some((d) => d.meals.length < s.nutrition.mealsPerDay);
      const short = plan.days.some((d) => d.totals.proteinG < ctx.targets.proteinG * PROTEIN_MET_RATIO);
      const label = `${s.nutrition.diet} ${s.nutrition.allergies.join('+')} ${s.nutrition.cookingMinutes}min ${s.nutrition.mealsPerDay} meals`;
      if (missing) expect({ label, slots: plan.diagnosis?.missingSlots.length ?? 0 }).not.toEqual({ label, slots: 0 });
      if (missing || short) expect({ label, explained: plan.diagnosis != null }).toEqual({ label, explained: true });
      if (plan.diagnosis) expect(plan.diagnosis.blockers.length + plan.diagnosis.adjustments.length).toBeGreaterThan(0);
    }
  });
});
