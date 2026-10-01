import type { Allergen, Diet, KitchenEquipment } from '../profile/schemas';
import { adaptRecipe, type FoodConstraints } from './constraints';
import type { ExclusionSource } from './exclusions';
import type { IsoDate } from '../shared/dates';
import { PROTEIN_MET_RATIO, planDay, planWeek, type PlannerContext, type WeeklyMealPlan } from './planner';
import { RECIPES, type MealSlot, type Recipe } from './recipes';

/**
 * Explains a meal plan that cannot be completed or stays under the protein target, names the
 * constraints responsible and the changes that would actually help (D-021). Every suggestion is
 * measured by re-planning with that one change; nothing is suggested on faith.
 * Allergies, intolerances and the diet are named but never suggested for removal.
 */

export type Blocker =
  | { kind: 'diet'; diet: Diet }
  | { kind: 'allergy'; allergen: Allergen }
  | { kind: 'exclusion'; input: string; source: ExclusionSource }
  | { kind: 'cooking_time'; minutes: number }
  | { kind: 'kitchen'; missing: KitchenEquipment[] };

export type Adjustment =
  | { kind: 'allow_excluded_food'; input: string }
  | { kind: 'more_cooking_time'; minutes: number }
  | { kind: 'kitchen_equipment'; equipment: KitchenEquipment[] }
  | { kind: 'meals_per_day'; mealsPerDay: number }
  | { kind: 'lower_protein_target'; reachableProteinG: number };

export interface PlanDiagnosis {
  /** Meal slots for which no recipe respects the constraints. */
  missingSlots: MealSlot[];
  /** Days without any meal. */
  emptyDays: number;
  /** Days under PROTEIN_MET_RATIO of the target. */
  proteinShortDays: number;
  targetProteinG: number;
  /** Best day of the plan (estimate). */
  reachableProteinG: number;
  blockers: Blocker[];
  adjustments: Adjustment[];
}

/** A change must raise the protein coverage by this much to count. */
const MEANINGFUL_GAIN = 0.05;
/** A lower protein target is suggested only from 75 % of the current one. */
const SLIGHTLY_LOWER_MIN = 0.75;

interface Outcome {
  missing: number;
  proteinRatio: number;
}

function slotsOf(mealsPerDay: number): MealSlot[] {
  const slots: Record<number, MealSlot[]> = {
    2: ['lunch', 'dinner'],
    3: ['breakfast', 'lunch', 'dinner'],
    4: ['breakfast', 'lunch', 'snack', 'dinner'],
    5: ['breakfast', 'snack', 'lunch', 'snack', 'dinner'],
  };
  return slots[mealsPerDay] ?? slots[3];
}

function missingSlots(ctx: PlannerContext): MealSlot[] {
  const recipes = ctx.recipes ?? RECIPES;
  return [...new Set(slotsOf(ctx.preferences.mealsPerDay))].filter(
    (slot) => !recipes.some((r) => r.slots.includes(slot) && adaptRecipe(r, ctx.constraints) !== null),
  );
}

/** One day re-planned from scratch: enough to compare options, cheap enough for a phone. */
function outcome(ctx: PlannerContext, date: string): Outcome {
  const day = planDay(date, { ...ctx, inventory: [] });
  const target = ctx.targets.proteinG;
  return {
    missing: missingSlots(ctx).length,
    proteinRatio: target > 0 ? day.totals.proteinG / target : 1,
  };
}

/** Fills a slot left empty without losing protein, or clearly raises protein without emptying a slot. */
function helps(base: Outcome, next: Outcome, proteinShort: boolean): boolean {
  if (next.missing > base.missing) return false;
  const gain = next.proteinRatio - base.proteinRatio;
  if (next.missing < base.missing) return gain > -MEANINGFUL_GAIN;
  return proteinShort && gain >= MEANINGFUL_GAIN;
}

interface Relaxation {
  blocker: Blocker;
  adjustment: Adjustment | null;
  constraints: FoodConstraints;
}

function relaxations(c: FoodConstraints, recipes: readonly Recipe[]): Relaxation[] {
  const list: Relaxation[] = [];
  if (c.diet !== 'omnivore')
    list.push({ blocker: { kind: 'diet', diet: c.diet }, adjustment: null, constraints: { ...c, diet: 'omnivore' } });
  for (const allergen of c.allergies) {
    list.push({
      blocker: { kind: 'allergy', allergen },
      adjustment: null,
      constraints: { ...c, allergies: c.allergies.filter((a) => a !== allergen) },
    });
  }
  c.exclusions.forEach((e, index) => {
    list.push({
      blocker: { kind: 'exclusion', input: e.input, source: e.source },
      // An intolerance is health, like an allergy: never suggested for removal.
      adjustment: e.source === 'excluded' ? { kind: 'allow_excluded_food', input: e.input } : null,
      constraints: { ...c, exclusions: c.exclusions.filter((_, i) => i !== index) },
    });
  });
  const longest = Math.max(...recipes.map((r) => r.minutes));
  if (c.maxMinutes < longest) {
    list.push({
      blocker: { kind: 'cooking_time', minutes: c.maxMinutes },
      adjustment: { kind: 'more_cooking_time', minutes: longest },
      constraints: { ...c, maxMinutes: longest },
    });
  }
  if (c.kitchen.length > 0) {
    // Only the appliances of recipes that the kitchen alone rules out.
    const anyKitchen = { ...c, kitchen: [] };
    const missing = [
      ...new Set(
        recipes
          .filter((r) => adaptRecipe(r, c) === null && adaptRecipe(r, anyKitchen) !== null)
          .flatMap((r) => r.equipment),
      ),
    ]
      .filter((e) => !c.kitchen.includes(e))
      .sort();
    if (missing.length > 0) {
      list.push({
        blocker: { kind: 'kitchen', missing },
        adjustment: { kind: 'kitchen_equipment', equipment: missing },
        constraints: anyKitchen,
      });
    }
  }
  return list;
}

/** Null when every slot has a recipe and every day reaches the protein target. */
export function diagnosePlan(plan: WeeklyMealPlan, ctx: PlannerContext): PlanDiagnosis | null {
  const missing = missingSlots(ctx);
  const proteinShortDays = plan.days.filter((d) => d.totals.proteinG < ctx.targets.proteinG * PROTEIN_MET_RATIO).length;
  if (missing.length === 0 && proteinShortDays === 0) return null;

  const date = plan.days[0]?.date ?? plan.weekStart;
  const proteinShort = proteinShortDays > 0;
  const base = outcome(ctx, date);
  const recipes = ctx.recipes ?? RECIPES;

  const found = relaxations(ctx.constraints, recipes)
    .map((r) => ({ ...r, result: outcome({ ...ctx, constraints: r.constraints }, date) }))
    .filter((r) => helps(base, r.result, proteinShort))
    .sort((a, b) => a.result.missing - b.result.missing || b.result.proteinRatio - a.result.proteinRatio);

  const adjustments: Adjustment[] = found.flatMap((r) => (r.adjustment ? [r.adjustment] : []));

  const meals = [2, 3, 4, 5]
    .filter((m) => m !== ctx.preferences.mealsPerDay)
    .map((m) => ({ m, result: outcome({ ...ctx, preferences: { ...ctx.preferences, mealsPerDay: m } }, date) }))
    // Changing the number of meals only counts if it leaves no slot without a recipe.
    .filter(({ result }) => result.missing === 0 && helps(base, result, proteinShort))
    .sort((a, b) => a.result.missing - b.result.missing || b.result.proteinRatio - a.result.proteinRatio)[0];
  if (meals) adjustments.push({ kind: 'meals_per_day', mealsPerDay: meals.m });

  const reachableProteinG = Math.round(Math.max(0, ...plan.days.map((d) => d.totals.proteinG)));
  // "Slightly lower": only offered when the best day is close to the target, never as a way out.
  if (proteinShort && reachableProteinG >= ctx.targets.proteinG * SLIGHTLY_LOWER_MIN) {
    adjustments.push({ kind: 'lower_protein_target', reachableProteinG });
  }

  return {
    missingSlots: missing,
    emptyDays: plan.days.filter((d) => d.meals.length === 0).length,
    proteinShortDays,
    targetProteinG: ctx.targets.proteinG,
    reachableProteinG,
    blockers: found.map((r) => r.blocker),
    adjustments,
  };
}

/** The week's plan with its diagnosis attached, as stored by the app. */
export function planWeekWithDiagnosis(weekStart: IsoDate, ctx: PlannerContext): WeeklyMealPlan {
  const plan = planWeek(weekStart, ctx);
  return { ...plan, diagnosis: diagnosePlan(plan, ctx) };
}
