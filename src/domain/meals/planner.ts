import type { NutritionTargets } from '../nutrition/engine';
import type { NutritionProfile } from '../profile/schemas';
import { addDays, type IsoDate } from '../shared/dates';
import { clamp, roundTo } from '../shared/math';
import type { Rationale } from '../shared/rationale';
import { getFood, nutrientsFor, sumNutrients, type Nutrients } from './catalog';
import { adaptRecipe, normalize, type FoodConstraints } from './constraints';
import type { PlanDiagnosis } from './diagnosis';
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
  /** Ingredients swapped to respect diet/allergies/exclusions, shown to the user as "adapted". */
  substitutions?: { from: string; to: string }[];
  rationale: Rationale;
}

export interface ProteinCoverage {
  targetG: number;
  /** Rounded planned protein (estimate). */
  plannedG: number;
  /** True when the plan reaches at least PROTEIN_MET_RATIO of the target. */
  met: boolean;
}

/** Energy of a day against its target (B1, D-022): never a day too low without saying so. */
export interface EnergyCoverage {
  /** Rounded planned energy (estimate). */
  plannedKcal: number;
  /** Target minus planned, rounded up to 50 kcal; 0 when the target is reached. */
  missingKcal: number;
  /** BMR or absolute floor (see NutritionTargets.floorKcal); null when unknown. */
  floorKcal: number | null;
  /** Meal slots of the day without any possible recipe. */
  missingSlots: MealSlot[];
  /** Planned energy under the floor. */
  belowFloor: boolean;
  /** The day must show "Cette journée est incomplète" with missingKcal. */
  incomplete: boolean;
}

export interface DailyMealPlan {
  date: IsoDate;
  meals: PlannedMeal[];
  totals: Nutrients;
  targetKcal: number;
  protein: ProteinCoverage;
  energy: EnergyCoverage;
}

/** A day counts as meeting its protein target from 90 % of it (estimates, not lab values). */
export const PROTEIN_MET_RATIO = 0.9;
/** An impossible meal that leaves at least this share of the energy target uncovered is reported. */
export const ENERGY_GAP_RATIO = 0.1;

/** Recipes kept per slot for the day-level search: best-ranked plus most protein-dense (≤ 7⁵ combinations). */
const CANDIDATES_PER_SLOT = 4;
const PROTEIN_DENSE_PER_SLOT = 3;
/** Nutrition outranks inventory and preferences (docs/NUTRITION_ENGINE.md, priority order). */
const PROTEIN_SHORTFALL_WEIGHT = 20;
/** Extra penalty below the "met" threshold, so variety or inventory never trade it away. */
const PROTEIN_UNMET_WEIGHT = 60;
const KCAL_DEVIATION_WEIGHT = 10;
const SAME_DAY_REPEAT_PENALTY = 3;

export interface WeeklyMealPlan {
  weekStart: IsoDate;
  days: DailyMealPlan[];
  /** Fingerprint of the inputs; a different key means the plan is stale (see mealPlanKey). */
  key?: string;
  /** Why the plan is incomplete or short in protein, and what would help (null = nothing to explain). */
  diagnosis?: PlanDiagnosis | null;
}

/** Bump when the planner's output changes meaning, so stored plans are regenerated. */
export const MEAL_PLANNER_VERSION = 5;

const SLOT_SHARES: Record<number, [MealSlot, number][]> = {
  2: [
    ['lunch', 0.5],
    ['dinner', 0.5],
  ],
  3: [
    ['breakfast', 0.25],
    ['lunch', 0.375],
    ['dinner', 0.375],
  ],
  4: [
    ['breakfast', 0.25],
    ['lunch', 0.3],
    ['snack', 0.15],
    ['dinner', 0.3],
  ],
  5: [
    ['breakfast', 0.2],
    ['snack', 0.1],
    ['lunch', 0.3],
    ['snack', 0.1],
    ['dinner', 0.3],
  ],
};

export interface PlannerContext {
  targets: Pick<NutritionTargets, 'calories' | 'proteinG'> & Partial<Pick<NutritionTargets, 'floorKcal'>>;
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
  substitutions: { from: string; to: string }[];
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
    const substitutions = base.ingredients
      .map((i, index) => ({ from: i.foodId, to: recipe.ingredients[index].foodId }))
      .filter((sub) => sub.from !== sub.to);
    candidates.push({ recipe, score, usesInventory, substitutions });
  }
  return candidates.sort((a, b) => b.score - a.score || a.recipe.id.localeCompare(b.recipe.id));
}

function scaleIngredients(ingredients: Ingredient[], servings: number): Ingredient[] {
  return ingredients.map((i) => ({ foodId: i.foodId, grams: Math.round(i.grams * servings) }));
}

function planMeal(date: IsoDate, index: number, slot: MealSlot, targetKcal: number, candidate: Candidate): PlannedMeal {
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
    substitutions: candidate.substitutions,
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

function proteinRatio(recipe: Recipe): number {
  const n = recipeNutrition(recipe.ingredients);
  return n.kcal > 0 ? (n.proteinG * 4) / n.kcal : 0;
}

interface SlotOption {
  candidate: Candidate;
  meal: PlannedMeal;
}

/**
 * Picks one recipe per slot by searching the combinations of the best candidates of each slot,
 * so the day as a whole reaches the protein target (a greedy per-meal choice cannot: see the
 * vegan regression tests). Deterministic: ties keep the first combination in ranking order.
 */
function bestCombination(options: SlotOption[][], ctx: PlannerContext): SlotOption[] {
  const { calories, proteinG } = ctx.targets;
  let best: { score: number; picks: SlotOption[] } | null = null;

  const visit = (slot: number, picks: SlotOption[], score: number, protein: number, kcal: number) => {
    if (slot === options.length) {
      const ratio = proteinG > 0 ? protein / proteinG : 1;
      const kcalDeviation = Math.max(0, Math.abs(kcal / calories - 1) - 0.05);
      const total =
        score -
        PROTEIN_SHORTFALL_WEIGHT * Math.max(0, 1 - ratio) -
        PROTEIN_UNMET_WEIGHT * Math.max(0, PROTEIN_MET_RATIO - ratio) -
        KCAL_DEVIATION_WEIGHT * kcalDeviation;
      if (!best || total > best.score + 1e-9) best = { score: total, picks: [...picks] };
      return;
    }
    if (options[slot].length === 0) return visit(slot + 1, picks, score, protein, kcal);
    for (const option of options[slot]) {
      const repeat = picks.some((p) => p.candidate.recipe.id === option.candidate.recipe.id);
      picks.push(option);
      visit(
        slot + 1,
        picks,
        score + option.candidate.score - (repeat ? SAME_DAY_REPEAT_PENALTY : 0),
        protein + option.meal.nutrition.proteinG,
        kcal + option.meal.nutrition.kcal,
      );
      picks.pop();
    }
  };
  visit(0, [], 0, 0, 0);
  return (best as { picks: SlotOption[] } | null)?.picks ?? [];
}

export function planDay(
  date: IsoDate,
  ctx: PlannerContext,
  stock = stockByFood(ctx.inventory),
  usage = new Map<string, number>(),
): DailyMealPlan {
  const shares = SLOT_SHARES[ctx.preferences.mealsPerDay] ?? SLOT_SHARES[3];
  const ranked = shares.map(([slot]) => rankRecipes(slot, ctx, stock, usage));
  const missingSlots = [...new Set(shares.filter((_, i) => ranked[i].length === 0).map(([slot]) => slot))];
  // A meal with no possible recipe hands its share to the others; the 2.5-serving cap of planMeal
  // keeps portions reasonable, and what it cannot cover is reported (energy.incomplete).
  const coveredShare = shares.reduce((sum, [, share], i) => sum + (ranked[i].length > 0 ? share : 0), 0);
  const options = shares.map(([slot, share], index) => {
    const byProtein = [...ranked[index]].sort((a, b) => proteinRatio(b.recipe) - proteinRatio(a.recipe));
    const kept = new Set([
      ...ranked[index].slice(0, CANDIDATES_PER_SLOT),
      ...byProtein.slice(0, PROTEIN_DENSE_PER_SLOT),
    ]);
    const targetKcal = (ctx.targets.calories * share) / (coveredShare || 1);
    return ranked[index]
      .filter((c) => kept.has(c))
      .map((candidate) => ({ candidate, meal: planMeal(date, index, slot, targetKcal, candidate) }));
  });
  const meals = bestCombination(options, ctx).map((p) => p.meal);
  for (const meal of meals) {
    usage.set(meal.recipeId, (usage.get(meal.recipeId) ?? 0) + 1);
    subtract(stock, meal.ingredients);
  }
  return summarizeDay(date, meals, ctx.targets, missingSlots);
}

/** Totals and protein coverage of a day; call again whenever a meal is replaced. */
export function summarizeDay(
  date: IsoDate,
  meals: PlannedMeal[],
  targets: PlannerContext['targets'],
  missingSlots: MealSlot[] = [],
): DailyMealPlan {
  const totals = sumNutrients(meals.map((m) => m.nutrition));
  return {
    date,
    meals,
    totals,
    targetKcal: targets.calories,
    protein: {
      targetG: targets.proteinG,
      plannedG: Math.round(totals.proteinG),
      met: totals.proteinG >= targets.proteinG * PROTEIN_MET_RATIO,
    },
    energy: energyCoverage(totals.kcal, targets, missingSlots),
  };
}

export function energyCoverage(
  plannedKcal: number,
  targets: PlannerContext['targets'],
  missingSlots: MealSlot[],
): EnergyCoverage {
  const gap = Math.max(0, targets.calories - plannedKcal);
  const floorKcal = targets.floorKcal ?? null;
  const belowFloor = floorKcal !== null && plannedKcal < floorKcal;
  return {
    plannedKcal: Math.round(plannedKcal),
    missingKcal: Math.ceil(gap / 50) * 50,
    floorKcal,
    missingSlots,
    belowFloor,
    incomplete: belowFloor || (missingSlots.length > 0 && gap >= targets.calories * ENERGY_GAP_RATIO),
  };
}

/** Replaces one meal and recomputes that day's totals. */
export function replaceMealInPlan(plan: WeeklyMealPlan, meal: PlannedMeal): WeeklyMealPlan {
  return {
    ...plan,
    days: plan.days.map((d) =>
      d.meals.some((m) => m.id === meal.id)
        ? summarizeDay(
            d.date,
            d.meals.map((m) => (m.id === meal.id ? meal : m)),
            { calories: d.targetKcal, proteinG: d.protein?.targetG ?? 0, floorKcal: d.energy?.floorKcal ?? undefined },
            d.energy?.missingSlots ?? [],
          )
        : d,
    ),
  };
}

/**
 * Meals already eaten stay in the regenerated plan. They are matched by day and slot (and
 * occurrence within the slot), not by id: ids contain the meal index, which moves when the
 * number of meals per day changes.
 */
export function carryOverEaten(next: WeeklyMealPlan, previous: WeeklyMealPlan | null): WeeklyMealPlan {
  if (!previous || previous.weekStart !== next.weekStart) return next;
  const slotKey = (meals: PlannedMeal[], m: PlannedMeal) =>
    `${m.date}|${m.slot}|${meals.filter((x) => x.slot === m.slot).indexOf(m)}`;
  const eaten = new Map(
    previous.days.flatMap((d) => d.meals.filter((m) => m.status === 'eaten').map((m) => [slotKey(d.meals, m), m])),
  );
  if (eaten.size === 0) return next;
  return next.days.reduce<WeeklyMealPlan>((plan, day) => {
    const kept = day.meals.flatMap((m) => {
      const old = eaten.get(slotKey(day.meals, m));
      return old ? [{ ...old, id: m.id }] : [];
    });
    return kept.reduce((p, m) => replaceMealInPlan(p, m), plan);
  }, next);
}

/**
 * Fingerprint of everything that must invalidate a stored plan: a diet or allergy change mid-week
 * has to regenerate it, never leave a now-forbidden meal on screen.
 */
export function mealPlanKey(weekStart: IsoDate, ctx: Omit<PlannerContext, 'inventory' | 'today' | 'recipes'>): string {
  return JSON.stringify([
    MEAL_PLANNER_VERSION,
    weekStart,
    Math.round(ctx.targets.calories),
    Math.round(ctx.targets.proteinG),
    ctx.constraints,
    ctx.preferences.mealsPerDay,
    ctx.preferences.likedFoods,
    ctx.preferences.dislikedFoods,
  ]);
}

export function planWeek(weekStart: IsoDate, ctx: PlannerContext): WeeklyMealPlan {
  const stock = stockByFood(ctx.inventory);
  const usage = new Map<string, number>();
  const days = Array.from({ length: 7 }, (_, i) => planDay(addDays(weekStart, i), ctx, stock, usage));
  return { weekStart, days, key: mealPlanKey(weekStart, ctx) };
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
