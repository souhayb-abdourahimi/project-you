import type { Allergen, Diet, KitchenEquipment, NutritionProfile } from '../profile/schemas';
import { getFood, type Food } from './catalog';
import type { Ingredient, Recipe } from './recipes';

export interface FoodConstraints {
  diet: Diet;
  allergies: Allergen[];
  /** Free-text foods the user cannot or will not eat (excluded + intolerances). */
  forbiddenTerms: string[];
  /** Empty = unknown kitchen, no appliance filtering. */
  kitchen: KitchenEquipment[];
  maxMinutes: number;
}

/** Common intolerance words mapped to the allergen that covers them. */
const INTOLERANCE_ALLERGENS: Record<string, Allergen> = {
  lactose: 'milk',
  lait: 'milk',
  gluten: 'gluten',
};

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function constraintsFrom(nutrition: NutritionProfile, kitchen: KitchenEquipment[]): FoodConstraints {
  const extraAllergens = nutrition.intolerances
    .map((i) => INTOLERANCE_ALLERGENS[normalize(i)])
    .filter((a): a is Allergen => a !== undefined);
  return {
    diet: nutrition.diet,
    allergies: [...new Set([...nutrition.allergies, ...extraAllergens])],
    forbiddenTerms: [...nutrition.excludedFoods, ...nutrition.intolerances].map(normalize).filter(Boolean),
    kitchen,
    maxMinutes: Math.max(nutrition.cookingMinutes, 5),
  };
}

export function isFoodAllowed(food: Food, c: FoodConstraints): boolean {
  if (c.diet === 'vegan' && food.animal !== null) return false;
  if (c.diet === 'vegetarian' && (food.animal === 'meat' || food.animal === 'fish')) return false;
  if (food.allergens.some((a) => c.allergies.includes(a))) return false;
  const names = [food.id, food.name.fr, food.name.en].map(normalize);
  return !c.forbiddenTerms.some((term) => names.some((name) => name.includes(term)));
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
