import { computeNutritionTargets } from '../../nutrition/engine';
import type { UserContextSnapshot } from '../../profile/schemas';
import { SCENARIOS, scenario } from '../../scenarios';
import { FOOD_CATALOG, getFood } from '../catalog';
import { constraintsFrom, isFoodAllowed } from '../constraints';
import {
  EXCLUSION_RULE_FOOD_IDS,
  excludedFoods,
  exclusionKey,
  resolveExclusion,
  resolveExclusions,
} from '../exclusions';
import { mealPlanKey, planWeek } from '../planner';

/** Review C1: free-text excluded foods and intolerances must really be applied (D-021). */

const excluded = (text: string) =>
  excludedFoods(resolveExclusion(text, 'excluded'))
    .map((f) => f.id)
    .sort();

function withNutrition(nutrition: Partial<UserContextSnapshot['nutrition']>): UserContextSnapshot {
  return scenario({
    ...SCENARIOS.studentMediumBudget,
    nutrition: { ...SCENARIOS.studentMediumBudget.nutrition, ...nutrition },
  });
}

function plannedFoods(s: UserContextSnapshot) {
  const plan = planWeek('2026-09-28', {
    targets: computeNutritionTargets(s, 2026),
    constraints: constraintsFrom(s.nutrition, s.lifestyle.kitchen),
    preferences: s.nutrition,
    inventory: [],
    today: '2026-09-30',
  });
  return plan.days.flatMap((d) => d.meals.flatMap((m) => m.ingredients.map((i) => getFood(i.foodId)!)));
}

describe('normalisation', () => {
  it('ignores case, accents, ligatures, punctuation and plurals', () => {
    expect(exclusionKey('Œufs')).toBe('oeuf');
    expect(exclusionKey('  OEUF ')).toBe('oeuf');
    expect(exclusionKey('Fruits à coque')).toBe('fruit a coque');
    expect(exclusionKey('pommes-de-terre')).toBe('pomme de terre');
    expect(exclusionKey('Céleri')).toBe('celeri');
    expect(exclusionKey('noix')).toBe('noix');
    expect(exclusionKey('choux')).toBe('chou');
    expect(exclusionKey('berries')).toBe('berry');
  });
});

describe('meaning of typed words', () => {
  it('"soja" excludes tofu, tempeh, textured soy protein and soy desserts', () => {
    for (const text of ['soja', 'Soja', 'SOYA', 'PST']) {
      expect(excluded(text)).toEqual(['soy_drink', 'soy_yogurt', 'tempeh', 'tofu', 'tvp_rehydrated']);
    }
  });

  it('"poisson" excludes salmon, tuna and any fish', () => {
    for (const text of ['poisson', 'Poissons', 'fish']) expect(excluded(text)).toEqual(['salmon', 'tuna_canned']);
    expect(FOOD_CATALOG.filter((f) => f.animal === 'fish').every((f) => excluded('poisson').includes(f.id))).toBe(true);
  });

  it('"viande" excludes every meat, and only meat', () => {
    expect(excluded('viande')).toEqual(
      FOOD_CATALOG.filter((f) => f.animal === 'meat')
        .map((f) => f.id)
        .sort(),
    );
    expect(excluded('viandes')).toEqual(excluded('viande'));
    expect(excluded('volaille')).toEqual(['chicken_breast']);
    expect(excluded('bœuf')).toEqual(['ground_beef_5']);
  });

  it('"oeufs" works like "oeuf" and "Œuf"', () => {
    expect(excluded('oeufs')).toEqual(['egg']);
    expect(excluded('oeuf')).toEqual(['egg']);
    expect(excluded('Œuf')).toEqual(['egg']);
  });

  it('handles peanuts and tree nuts separately', () => {
    expect(excluded('arachide')).toEqual(['peanut_butter']);
    expect(excluded('cacahuètes')).toEqual(['peanut_butter']);
    expect(excluded('noix')).toEqual(['almonds']);
    expect(excluded('fruits à coque')).toEqual(['almonds']);
    expect(excluded('noix')).not.toContain('peanut_butter');
  });

  it('matches whole words, never substrings ("pomme" is not "pomme de terre")', () => {
    expect(excluded('pomme')).toEqual(['apple']);
    expect(excluded('pommes de terre')).toEqual(['potato']);
    expect(excluded('patate')).toEqual(['potato']);
    expect(excluded('thon')).toEqual(['tuna_canned']);
  });

  it('falls back to food names for words without a rule', () => {
    expect(excluded('tempeh')).toEqual(['tempeh']);
    expect(excluded('brocolis')).toEqual(['broccoli']);
    expect(excluded('pois chiches')).toEqual(['chickpeas_canned']);
  });

  it('says when a word is understood but no food contains it, or when it is not understood', () => {
    expect(resolveExclusion('porc', 'excluded')).toMatchObject({ meanings: ['pork'] });
    expect(excluded('porc')).toEqual([]);
    expect(resolveExclusion('sésame', 'excluded')).toMatchObject({ meanings: ['sesame'], allergens: ['sesame'] });
    expect(resolveExclusion('xyzzy', 'excluded')).toMatchObject({ meanings: [], foodIds: [] });
    expect(excluded('xyzzy')).toEqual([]);
  });

  it('excludes every known word of a phrase rather than too little', () => {
    expect(resolveExclusion('lait de soja', 'excluded').meanings.sort()).toEqual(['milk', 'soy']);
  });

  it('treats intolerances with the same dictionary', () => {
    expect(excludedFoods(resolveExclusion('lactose', 'intolerance')).every((f) => f.allergens.includes('milk'))).toBe(
      true,
    );
    expect(resolveExclusions(['soja'], ['gluten', ' '])).toHaveLength(2);
  });

  it('only references foods of the catalogue', () => {
    for (const id of EXCLUSION_RULE_FOOD_IDS) expect(getFood(id)).toBeDefined();
  });
});

describe('meal plans', () => {
  it('never plan an excluded food or intolerance (scenario freeTextExclusions)', () => {
    const s = SCENARIOS.freeTextExclusions;
    const foods = plannedFoods(s);
    expect(foods.length).toBeGreaterThan(0);
    for (const f of foods) {
      expect(f.animal).not.toBe('fish');
      expect(f.allergens).not.toContain('eggs');
      expect(f.allergens).not.toContain('soy');
      expect(f.allergens).not.toContain('milk');
    }
  });

  it.each([
    ['soja', (id: string) => getFood(id)!.allergens.includes('soy')],
    ['viande', (id: string) => getFood(id)!.animal === 'meat'],
    ['pomme', (id: string) => id === 'apple'],
    ['arachide', (id: string) => id === 'peanut_butter'],
  ])('exclusion "%s" is applied to the whole week', (text, forbidden) => {
    const foods = plannedFoods(withNutrition({ excludedFoods: [text] }));
    expect(foods.filter((f) => forbidden(f.id))).toEqual([]);
  });

  it('keeps "pomme de terre" when only "pomme" is excluded', () => {
    const c = constraintsFrom(withNutrition({ excludedFoods: ['pomme'] }).nutrition, []);
    expect(isFoodAllowed(getFood('potato')!, c)).toBe(true);
    expect(isFoodAllowed(getFood('apple')!, c)).toBe(false);
  });

  it('regenerates a stored plan when an exclusion changes', () => {
    const s = SCENARIOS.studentMediumBudget;
    const key = (excludedFoods: string[]) =>
      mealPlanKey('2026-09-28', {
        targets: computeNutritionTargets(s, 2026),
        constraints: constraintsFrom({ ...s.nutrition, excludedFoods }, s.lifestyle.kitchen),
        preferences: s.nutrition,
      });
    expect(key(['soja'])).not.toBe(key([]));
    expect(key(['soja'])).not.toBe(key(['poisson']));
  });
});
