import type { NutritionTargets } from '../nutrition/engine';
import type { NutritionProfile } from '../profile/schemas';
import { addDays, type IsoDate } from '../shared/dates';
import { clamp, roundTo } from '../shared/math';
import type { Rationale } from '../shared/rationale';
import { getFood, nutrientsFor, sumNutrients, type Nutrients } from './catalog';
import { adaptRecipe, normalize, type FoodConstraints } from './constraints';
import { stockByFood, isExpiringSoon, type InventoryItem } from './inventory';
import { RECIPES, type Ingredient, type MealSlot, type Recipe } from './recipes';

export type MealStatus = 'planned' | 'eaten' | 'skipped';

export interface PlannedMeal {
  id: string;
  date: IsoDate;
  slot: MealSlot;
  recipeId: string;
  servings: number;
  /** Ingredients after constraint substitutions, already multiplied by `servings`. */
  ingredients: Ingredient[];
  nutrition: Nutrients;
  status: MealStatus;
  usesInventory: string[];
  rationale: Rationale;
}

export interface DailyMealPlan {
  date: IsoDate;
  meals: PlannedMeal[];
  totals: Nutrients;
  targetKcal: number;
}

export interface WeeklyMealPlan {
  weekStart: IsoDate;
  days: DailyMealPlan[];
}

const SLOT_SHARES: Record<number, [MealSlot, number][]> = {
  2: [['lunch', 0.5], ['dinner', 0.5]],
  3: [['breakfast', 0.25], ['lunch', 0.375], ['dinner', 0.375]],
  4: [['breakfast', 0.25], ['lunch', 0.3], ['snack', 0.15], ['dinner', 0.3]],
  5: [['breakfast', 0.2], ['snack', 0.1], ['lunch', 0.3], ['snack', 0.1], ['dinner', 0.3]],
};

export interface PlannerContext {
  targets: Pick<NutritionTargets, 'calories' | 'proteinG'>;
  constraints: FoodConstraints;
  preferences: Pick<NutritionProfile, 'likedFoods' | 'dislikedFoods' | 'mealsPerDay'>;
  inventory: InventoryItem[];
  today: IsoDate;
  recipes?: readonly Recipe[];
}

export function recipeNutrition(ingredients: Ingredient[]): Nutrients {
  return sumNutrients(
    ingredients.map((i) => {
      const food = getFood(i.foodId);
      return food ? nutrientsFor(food, i.grams) : { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
    }),
  );
}

function matchesAny(foodId: string, terms: string[]): boolean {
  const food = getFood(foodId);
  if (!food || terms.length === 0) return false;
  const names = [food.id, food.name.fr, food.name.en].map(normalize);
  return terms.some((t) => names.some((n) => n.includes(normalize(t))));
}

interface Candidate {
  recipe: Recipe;
  score: number;
  usesInventory: string[];
}

/**
 * Scores compliant recipes. Priority order (see docs/NUTRITION_ENGINE.md): available foods,
 * minimal waste, hard constraints (already filtered), nutrition, preferences, extra purchases.
 */
export function rankRecipes(
  slot: MealSlot,
  ctx: PlannerContext,
  stock: Map<string, number>,
  usage: Map<string, number>,
): Candidate[] {
  const expiring = new Set(
    ctx.inventory.filter((i) => i.foodId && isExpiringSoon(i, ctx.today)).map((i) => i.foodId as string),
  );
  const candidates: Candidate[] = [];
  for (const base of ctx.recipes ?? RECIPES) {
    if (!base.slots.includes(slot)) continue;
    const recipe = adaptRecipe(base, ctx.constraints);
    if (!recipe) continue;

    const totalGrams = recipe.ingredients.reduce((s, i) => s + i.grams, 0);
    const coveredGrams = recipe.ingredients.reduce((s, i) => s + Math.min(i.grams, stock.get(i.foodId) ?? 0), 0);
    const usesInventory = recipe.ingredients.filter((i) => (stock.get(i.foodId) ?? 0) > 0).map((i) => i.foodId);
    const nutrition = recipeNutrition(recipe.ingredients);
    const proteinDensity = nutrition.kcal > 0 ? (nutrition.proteinG * 4) / nutrition.kcal : 0;

    let score = 0;
    score += 4 * (coveredGrams / totalGrams);
    score += 1.5 * usesInventory.filter((id) => expiring.has(id)).length;
    score += 1.5 * proteinDensity;
    score += 0.5 * recipe.ingredients.filter((i) => matchesAny(i.foodId, ctx.preferences.likedFoods)).length;
    score -= 2 * recipe.ingredients.filter((i) => matchesAny(i.foodId, ctx.preferences.dislikedFoods)).length;
    score -= 1.5 * (usage.get(recipe.id) ?? 0);
    candidates.push({ recipe, score, usesInventory });
  }
  return candidates.sort((a, b) => b.score - a.score || a.recipe.id.localeCompare(b.recipe.id));
}

function scaleIngredients(ingredients: Ingredient[], servings: number): Ingredient[] {
  return ingredients.map((i) => ({ foodId: i.foodId, grams: Math.round(i.grams * servings) }));
}

function planMeal(
  date: IsoDate,
  index: number,
  slot: MealSlot,
  targetKcal: number,
  candidate: Candidate,
): PlannedMeal {
  const baseKcal = recipeNutrition(candidate.recipe.ingredients).kcal;
  const servings = baseKcal > 0 ? clamp(roundTo(targetKcal / baseKcal, 0.25), 0.5, 2.5) : 1;
  const ingredients = scaleIngredients(candidate.recipe.ingredients, servings);
  return {
    id: `${date}-${index}-${slot}`,
    date,
    slot,
    recipeId: candidate.recipe.id,
    servings,
    ingredients,
    nutrition: recipeNutrition(ingredients),
    status: 'planned',
    usesInventory: candidate.usesInventory,
    rationale: {
      goal: 'meals.goal.daily_target',
      constraints: ['meals.constraint.diet', 'meals.constraint.allergies', 'meals.constraint.cooking_time'],
      dataUsed: ['data.inventory', 'data.preferences', 'data.targets'],
      reason: candidate.usesInventory.length > 0 ? 'meals.reason.uses_inventory' : 'meals.reason.fits_targets',
      params: { targetKcal: Math.round(targetKcal), inventoryCount: candidate.usesInventory.length },
    },
  };
}

function subtract(stock: Map<string, number>, ingredients: Ingredient[]): void {
  for (const i of ingredients) {
    const left = (stock.get(i.foodId) ?? 0) - i.grams;
    stock.set(i.foodId, Math.max(0, left));
  }
}

export function planDay(
  date: IsoDate,
  ctx: PlannerContext,
  stock = stockByFood(ctx.inventory),
  usage = new Map<string, number>(),
): DailyMealPlan {
  const shares = SLOT_SHARES[ctx.preferences.mealsPerDay] ?? SLOT_SHARES[3];
  const meals: PlannedMeal[] = [];
  const usedToday = new Set<string>();
  shares.forEach(([slot, share], index) => {
    const ranked = rankRecipes(slot, ctx, stock, usage).filter((c) => !usedToday.has(c.recipe.id));
    const best = ranked[0];
    if (!best) return;
    const meal = planMeal(date, index, slot, ctx.targets.calories * share, best);
    meals.push(meal);
    usedToday.add(best.recipe.id);
    usage.set(best.recipe.id, (usage.get(best.recipe.id) ?? 0) + 1);
    subtract(stock, meal.ingredients);
  });
  return { date, meals, totals: sumNutrients(meals.map((m) => m.nutrition)), targetKcal: ctx.targets.calories };
}

export function planWeek(weekStart: IsoDate, ctx: PlannerContext): WeeklyMealPlan {
  const stock = stockByFood(ctx.inventory);
  const usage = new Map<string, number>();
  const days = Array.from({ length: 7 }, (_, i) => planDay(addDays(weekStart, i), ctx, stock, usage));
  return { weekStart, days };
}

export type ReplaceReason = 'replace' | 'missing_ingredient' | 'faster' | 'more_protein' | 'cheaper';

export type AlternativesResult =
  | { status: 'ok'; meals: PlannedMeal[] }
  /** e.g. "cheaper" without real price data: we never guess prices. */
  | { status: 'unavailable'; reason: 'no_price_data' };

/** "Remplacer", "Je n'ai pas cet ingrédient", "Plus rapide", "Plus riche en protéines", "Moins cher". */
export function alternativesFor(
  meal: PlannedMeal,
  reason: ReplaceReason,
  ctx: PlannerContext,
  options: { missingFoodId?: string; hasPriceData?: boolean } = {},
): AlternativesResult {
  if (reason === 'cheaper' && !options.hasPriceData) return { status: 'unavailable', reason: 'no_price_data' };

  const current = RECIPES.find((r) => r.id === meal.recipeId);
  const stock = stockByFood(ctx.inventory);
  if (options.missingFoodId) stock.delete(options.missingFoodId);
  const targetKcal = meal.nutrition.kcal;
  const currentProteinRatio = meal.nutrition.kcal > 0 ? (meal.nutrition.proteinG * 4) / meal.nutrition.kcal : 0;

  const candidates = rankRecipes(meal.slot, ctx, stock, new Map())
    .filter((c) => c.recipe.id !== meal.recipeId)
    .filter((c) => {
      if (reason === 'missing_ingredient' && options.missingFoodId) {
        return !c.recipe.ingredients.some((i) => i.foodId === options.missingFoodId);
      }
      if (reason === 'faster' && current) return c.recipe.minutes < current.minutes;
      if (reason === 'more_protein') {
        const n = recipeNutrition(c.recipe.ingredients);
        return n.kcal > 0 && (n.proteinG * 4) / n.kcal > currentProteinRatio;
      }
      return true;
    });

  return {
    status: 'ok',
    meals: candidates.slice(0, 3).map((c, i) => ({
      ...planMeal(meal.date, i, meal.slot, targetKcal, c),
      id: meal.id,
    })),
  };
}
