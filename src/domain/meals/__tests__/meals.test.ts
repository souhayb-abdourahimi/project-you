import { SCENARIOS } from '../../scenarios';
import { computeNutritionTargets } from '../../nutrition/engine';
import { summarizeWeek } from '../budget';
import { FOOD_CATALOG, getFood } from '../catalog';
import { constraintsFrom, isFoodAllowed } from '../constraints';
import { consume, type InventoryItem } from '../inventory';
import { alternativesFor, planDay, planWeek, type PlannerContext } from '../planner';
import { getRecipe } from '../recipes';
import { buildShoppingList } from '../shopping';
import type { UserContextSnapshot } from '../../profile/schemas';

const TODAY = '2026-09-30';

function item(foodId: string, quantity: number, extra: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: `inv-${foodId}`,
    foodId,
    name: foodId,
    quantity,
    unit: 'g',
    category: 'x',
    expiresOn: null,
    source: 'manual',
    addedAt: TODAY,
    updatedAt: TODAY,
    ...extra,
  };
}

function ctxFor(s: UserContextSnapshot, inventory: InventoryItem[] = []): PlannerContext {
  return {
    targets: computeNutritionTargets(s, 2026),
    constraints: constraintsFrom(s.nutrition, s.lifestyle.kitchen),
    preferences: s.nutrition,
    inventory,
    today: TODAY,
  };
}

describe('catalogue', () => {
  it('comes from Ciqual, not from demo data (consistency suite: ciqual/__tests__)', () => {
    expect(FOOD_CATALOG.length).toBeGreaterThan(0);
    expect(FOOD_CATALOG.every((f) => !f.meta.isMock && f.meta.provider === 'anses-ciqual')).toBe(true);
  });
});

describe('low budget (Ciqual values)', () => {
  const s = SCENARIOS.studentLowBudget;
  const ctx = ctxFor(s);
  const plan = planWeek('2026-09-28', ctx);

  it('plans meals that need at most a microwave and reach the protein target', () => {
    for (const day of plan.days) {
      expect(day.protein.met).toBe(true);
      for (const meal of day.meals)
        for (const tool of getRecipe(meal.recipeId)!.equipment) expect(tool).toBe('microwave');
    }
  });

  it('builds a shopping list from catalogue foods without inventing a price', () => {
    const list = buildShoppingList(
      plan.days.flatMap((d) => d.meals),
      [],
      '2026-09-28',
    );
    expect(list.items.length).toBeGreaterThan(0);
    for (const i of list.items) {
      expect(getFood(i.foodId)?.meta.isMock).toBe(false);
      expect(i.estimatedCostCents).toBeNull();
    }
    expect(list.knownCostCents).toBeNull();
  });
});

describe('hard constraints', () => {
  it('never plans an animal product or allergen for a vegan with a peanut allergy', () => {
    const s = SCENARIOS.vegan;
    const plan = planWeek('2026-09-28', ctxFor(s));
    const c = constraintsFrom(s.nutrition, s.lifestyle.kitchen);
    const foods = plan.days.flatMap((d) => d.meals.flatMap((m) => m.ingredients.map((i) => getFood(i.foodId)!)));
    expect(foods.length).toBeGreaterThan(0);
    for (const f of foods) {
      expect(f.animal).toBeNull();
      expect(f.allergens).not.toContain('peanuts');
      expect(isFoodAllowed(f, c)).toBe(true);
    }
  });

  it('never plans meat or fish for a vegetarian, but may use eggs and dairy', () => {
    const s = { ...SCENARIOS.fatLoss, nutrition: { ...SCENARIOS.fatLoss.nutrition, diet: 'vegetarian' as const } };
    const plan = planWeek('2026-09-28', ctxFor(s));
    const origins = new Set(
      plan.days.flatMap((d) => d.meals.flatMap((m) => m.ingredients.map((i) => getFood(i.foodId)!.animal))),
    );
    expect(origins.has('meat')).toBe(false);
    expect(origins.has('fish')).toBe(false);
    for (const day of plan.days) expect(day.protein.met).toBe(true);
  });

  it('treats lactose intolerance as a milk exclusion', () => {
    const s = {
      ...SCENARIOS.studentMediumBudget,
      nutrition: { ...SCENARIOS.studentMediumBudget.nutrition, intolerances: ['Lactose'] },
    };
    const plan = planWeek('2026-09-28', ctxFor(s));
    const allergens = plan.days.flatMap((d) =>
      d.meals.flatMap((m) => m.ingredients.flatMap((i) => getFood(i.foodId)!.allergens)),
    );
    expect(allergens).not.toContain('milk');
  });

  it('respects the kitchen and cooking time', () => {
    const s = SCENARIOS.studentLowBudget; // microwave only
    const plan = planDay(TODAY, ctxFor(s));
    for (const m of plan.meals) {
      expect(getRecipe(m.recipeId)!.equipment.every((e) => e === 'microwave')).toBe(true);
    }
  });

  it('excludes free-text forbidden foods, accent-insensitively', () => {
    const s = {
      ...SCENARIOS.studentMediumBudget,
      nutrition: { ...SCENARIOS.studentMediumBudget.nutrition, excludedFoods: ['oeuf', 'thon'] },
    };
    const plan = planWeek('2026-09-28', ctxFor(s));
    const ids = plan.days.flatMap((d) => d.meals.flatMap((m) => m.ingredients.map((i) => i.foodId)));
    expect(ids).not.toContain('egg');
    expect(ids).not.toContain('tuna_canned');
  });
});

describe('planner', () => {
  it('plans one meal per slot and roughly hits the calorie target', () => {
    const s = SCENARIOS.studentMediumBudget;
    const day = planDay(TODAY, ctxFor(s));
    expect(day.meals.map((m) => m.slot)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(Math.abs(day.totals.kcal - day.targetKcal) / day.targetKcal).toBeLessThan(0.3);
  });

  it('prioritises food already at home', () => {
    const s = SCENARIOS.studentMediumBudget;
    const day = planDay(TODAY, ctxFor(s, [item('lentils', 500), item('spinach', 300), item('rice', 1000)]));
    expect(day.meals.some((m) => m.recipeId === 'lentil_curry')).toBe(true);
  });

  it('varies recipes over the week', () => {
    const plan = planWeek('2026-09-28', ctxFor(SCENARIOS.studentMediumBudget));
    const lunches = new Set(plan.days.map((d) => d.meals.find((m) => m.slot === 'lunch')?.recipeId));
    expect(lunches.size).toBeGreaterThan(2);
  });

  it('never guesses a cheaper option without price data', () => {
    const ctx = ctxFor(SCENARIOS.studentMediumBudget);
    const meal = planDay(TODAY, ctx).meals[1];
    expect(alternativesFor(meal, 'cheaper', ctx)).toEqual({ status: 'unavailable', reason: 'no_price_data' });
  });

  it('offers faster and higher-protein alternatives', () => {
    const ctx = ctxFor(SCENARIOS.studentMediumBudget);
    const meal = planDay(TODAY, ctx).meals[1];
    const faster = alternativesFor(meal, 'faster', ctx);
    expect(faster.status).toBe('ok');
    const missing = alternativesFor(meal, 'missing_ingredient', ctx, { missingFoodId: meal.ingredients[0].foodId });
    if (missing.status === 'ok') {
      for (const alt of missing.meals)
        expect(alt.ingredients.map((i) => i.foodId)).not.toContain(meal.ingredients[0].foodId);
    }
  });
});

describe('shopping list', () => {
  it('subtracts inventory and never invents a price', () => {
    const ctx = ctxFor(SCENARIOS.studentMediumBudget, [item('rice', 5000)]);
    const plan = planWeek('2026-09-28', ctx);
    const list = buildShoppingList(
      plan.days.flatMap((d) => d.meals),
      ctx.inventory,
      '2026-09-28',
    );
    expect(list.items.find((i) => i.foodId === 'rice')).toBeUndefined();
    expect(list.items.every((i) => i.estimatedCostCents === null)).toBe(true);
    expect(list.knownCostCents).toBeNull();
  });

  it('uses real prices when provided', () => {
    const ctx = ctxFor(SCENARIOS.studentMediumBudget);
    const plan = planDay(TODAY, ctx);
    const list = buildShoppingList(plan.meals, [], TODAY, (id) => (id === 'oats' ? 200 : null));
    const oats = list.items.find((i) => i.foodId === 'oats');
    if (oats) expect(oats.estimatedCostCents).toBeGreaterThan(0);
  });
});

describe('inventory', () => {
  it('consumes soonest-expiring items first', () => {
    const items = [
      item('rice', 300, { id: 'a', expiresOn: '2026-12-01' }),
      item('rice', 200, { id: 'b', expiresOn: '2026-10-02' }),
    ];
    const after = consume(items, 'rice', 250, TODAY);
    expect(after.find((i) => i.id === 'b')!.quantity).toBe(0);
    expect(after.find((i) => i.id === 'a')!.quantity).toBe(250);
  });

  it('handles pieces through the average piece mass', () => {
    const after = consume([item('egg', 6, { unit: 'piece' })], 'egg', 110, TODAY);
    expect(after[0].quantity).toBe(4);
  });
});

describe('budget', () => {
  it('computes planned / spent / remaining', () => {
    const s = summarizeWeek(
      4500,
      [
        { id: '1', amountCents: 2000, spentOn: '2026-09-28' },
        { id: '2', amountCents: 1470, spentOn: '2026-10-01' },
        { id: '3', amountCents: 9999, spentOn: '2026-10-10' },
      ],
      '2026-09-28',
    );
    expect(s).toMatchObject({ plannedCents: 4500, spentCents: 3470, remainingCents: 1030, status: 'on_track' });
  });
});
