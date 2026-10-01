import type { Allergen, Diet, KitchenEquipment, NutritionProfile } from '../profile/schemas';
import { getFood, type Food } from './catalog';
import { excludes, resolveExclusions, type ResolvedExclusion } from './exclusions';
import type { Ingredient, Recipe } from './recipes';

export { normalize } from './exclusions';

export interface FoodConstraints {
  diet: Diet;
  allergies: Allergen[];
  /** Excluded foods and intolerances typed by the user, translated into catalogue targets (D-021). */
  exclusions: ResolvedExclusion[];
  /** Empty = unknown kitchen, no appliance filtering. */
  kitchen: KitchenEquipment[];
  maxMinutes: number;
}

export function constraintsFrom(nutrition: NutritionProfile, kitchen: KitchenEquipment[]): FoodConstraints {
  return {
    diet: nutrition.diet,
    allergies: [...new Set(nutrition.allergies)],
    exclusions: resolveExclusions(nutrition.excludedFoods, nutrition.intolerances),
    kitchen,
    maxMinutes: Math.max(nutrition.cookingMinutes, 5),
  };
}

export function isFoodAllowed(food: Food, c: FoodConstraints): boolean {
  if (c.diet === 'vegan' && food.animal !== null) return false;
  if (c.diet === 'vegetarian' && (food.animal === 'meat' || food.animal === 'fish')) return false;
  if (food.allergens.some((a) => c.allergies.includes(a))) return false;
  return !c.exclusions.some((e) => excludes(e, food));
}

/**
 * Returns the recipe with forbidden ingredients swapped for allowed substitutes,
 * or null when it cannot be made compliant. Hard constraints are never relaxed.
 */
export function adaptRecipe(recipe: Recipe, c: FoodConstraints): Recipe | null {
  if (recipe.minutes > c.maxMinutes) return null;
  if (c.kitchen.length > 0 && !recipe.equipment.every((e) => c.kitchen.includes(e))) return null;

  const ingredients: Ingredient[] = [];
  for (const ingredient of recipe.ingredients) {
    const food = getFood(ingredient.foodId);
    if (!food) return null;
    if (isFoodAllowed(food, c)) {
      ingredients.push(ingredient);
      continue;
    }
    const substitute = (recipe.substitutions[ingredient.foodId] ?? [])
      .map(getFood)
      .find((f): f is Food => f !== undefined && isFoodAllowed(f, c));
    if (!substitute) return null;
    ingredients.push({ foodId: substitute.id, grams: ingredient.grams });
  }
  return { ...recipe, ingredients };
}
