import { daysBetween, type IsoDate } from '../shared/dates';
import { getFood } from './catalog';
import { stockByFood, type InventoryItem } from './inventory';
import type { PlannedMeal } from './planner';

export type ShoppingPriority = 'high' | 'medium' | 'low';

export interface ShoppingListItem {
  foodId: string;
  grams: number;
  priority: ShoppingPriority;
  /** Recipes in the plan that use this food. */
  recipeIds: string[];
  /** Protein grams this purchase brings, as a simple nutritional-interest signal. */
  proteinG: number;
  /** Estimated cost in cents, or null when no real price is known ("Donnée indisponible"). */
  estimatedCostCents: number | null;
}

export interface ShoppingList {
  items: ShoppingListItem[];
  /** Sum of known costs; null if no item has a real price. */
  knownCostCents: number | null;
  itemsWithoutPrice: number;
}

/** Price per kg in cents, only from a real source (user receipt or PriceProvider). */
export type PriceLookup = (foodId: string) => number | null;

const noPrices: PriceLookup = () => null;

/** Builds the list of what the planned meals need beyond the current inventory. */
export function buildShoppingList(
  meals: PlannedMeal[],
  inventory: InventoryItem[],
  today: IsoDate,
  priceOf: PriceLookup = noPrices,
): ShoppingList {
  const stock = stockByFood(inventory);
  const needs = new Map<string, { grams: number; firstDate: IsoDate; recipeIds: Set<string> }>();

  const upcoming = meals
    .filter((m) => m.status === 'planned' && m.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const meal of upcoming) {
    for (const ingredient of meal.ingredients) {
      const available = stock.get(ingredient.foodId) ?? 0;
      const fromStock = Math.min(available, ingredient.grams);
      stock.set(ingredient.foodId, available - fromStock);
      const missing = ingredient.grams - fromStock;
      if (missing <= 0) continue;
      const need = needs.get(ingredient.foodId) ?? { grams: 0, firstDate: meal.date, recipeIds: new Set<string>() };
      need.grams += missing;
      need.recipeIds.add(meal.recipeId);
      needs.set(ingredient.foodId, need);
    }
  }

  const items: ShoppingListItem[] = [...needs.entries()].map(([foodId, need]) => {
    const food = getFood(foodId);
    const daysUntil = daysBetween(today, need.firstDate);
    const pricePerKg = priceOf(foodId);
    return {
      foodId,
      grams: Math.ceil(need.grams / 10) * 10,
      priority: daysUntil <= 1 ? 'high' : daysUntil <= 3 ? 'medium' : 'low',
      recipeIds: [...need.recipeIds].sort(),
      proteinG: food ? Math.round((food.per100g.proteinG * need.grams) / 100) : 0,
      estimatedCostCents: pricePerKg === null ? null : Math.round((pricePerKg * need.grams) / 1000),
    };
  });

  const order: Record<ShoppingPriority, number> = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => order[a.priority] - order[b.priority] || a.foodId.localeCompare(b.foodId));

  const priced = items.filter((i) => i.estimatedCostCents !== null);
  return {
    items,
    knownCostCents: priced.length === 0 ? null : priced.reduce((s, i) => s + (i.estimatedCostCents ?? 0), 0),
    itemsWithoutPrice: items.length - priced.length,
  };
}
