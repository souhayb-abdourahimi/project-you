import { computeNutritionTargets } from '../../nutrition/engine';
import { NO_PARTICULAR_DIET, type UserContextSnapshot } from '../../profile/schemas';
import { SCENARIOS, scenario } from '../../scenarios';
import { FOOD_CATALOG, getFood } from '../catalog';
import { constraintsFrom, isFoodAllowed } from '../constraints';
import { planWeek } from '../planner';

/**
 * D-046: diet, allergies and exclusions are separate hard constraints. "Aucun régime particulier"
 * adds no exclusion of its own; a diet excludes; allergies and exclusions always win.
 */

const withNutrition = (nutrition: Partial<UserContextSnapshot['nutrition']>) =>
  scenario({ nutrition: { ...SCENARIOS.studentMediumBudget.nutrition, ...nutrition } });

function plannedFoods(s: UserContextSnapshot) {
  const plan = planWeek('2026-09-28', {
    targets: computeNutritionTargets(s, 2026),
    constraints: constraintsFrom(s.nutrition, s.lifestyle.kitchen),
    preferences: s.nutrition,
    inventory: [],
    today: '2026-09-28',
  });
  return plan.days.flatMap((d) => d.meals.flatMap((m) => m.ingredients.map((i) => getFood(i.foodId)!)));
}

const none = { allergies: [], intolerances: [], excludedFoods: [], dislikedFoods: [] };

describe('diet invariants (D-046)', () => {
  it('"Aucun régime particulier" is the omnivore value and allows every food of the catalogue', () => {
    expect(NO_PARTICULAR_DIET).toBe('omnivore');
    const c = constraintsFrom(withNutrition({ diet: NO_PARTICULAR_DIET, ...none }).nutrition, []);
    expect(FOOD_CATALOG.filter((f) => !isFoodAllowed(f, c))).toEqual([]);
  });

  it('vegan: no animal food in a whole week', () => {
    const foods = plannedFoods(withNutrition({ diet: 'vegan', ...none }));
    expect(foods.length).toBeGreaterThan(0);
    expect(foods.filter((f) => f.animal !== null).map((f) => f.id)).toEqual([]);
  });

  it('vegetarian: no meat and no fish in a whole week', () => {
    const foods = plannedFoods(withNutrition({ diet: 'vegetarian', ...none }));
    expect(foods.length).toBeGreaterThan(0);
    expect(foods.filter((f) => f.animal === 'meat' || f.animal === 'fish').map((f) => f.id)).toEqual([]);
  });

  it('allergies win over "no particular diet": an allergen is never planned', () => {
    const foods = plannedFoods(withNutrition({ diet: NO_PARTICULAR_DIET, ...none, allergies: ['milk', 'peanuts'] }));
    expect(foods.length).toBeGreaterThan(0);
    expect(foods.filter((f) => f.allergens.includes('milk') || f.allergens.includes('peanuts'))).toEqual([]);
  });

  it('allergies and a diet add up (vegan + soy allergy)', () => {
    const foods = plannedFoods(withNutrition({ diet: 'vegan', ...none, allergies: ['soy'] }));
    expect(foods.filter((f) => f.animal !== null || f.allergens.includes('soy'))).toEqual([]);
  });
});
