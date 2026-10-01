import type { Allergen } from '../profile/schemas';
import type { ExternalDataMeta } from '../shared/external';

import { CIQUAL_CODES, ciqualFood, ciqualMeta } from './ciqual';

export type FoodCategory =
  'protein' | 'dairy' | 'grain' | 'legume' | 'vegetable' | 'fruit' | 'fat' | 'nut_seed' | 'condiment';

/** Animal origin, used to enforce vegetarian/vegan diets. */
export type AnimalOrigin = 'meat' | 'fish' | 'dairy' | 'egg' | null;

export interface Nutrients {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface Food {
  id: string;
  name: { fr: string; en: string };
  category: FoodCategory;
  per100g: Nutrients;
  allergens: Allergen[];
  animal: AnimalOrigin;
  /** Average mass of one piece, when the food is usually counted (e.g. eggs). */
  gramsPerPiece?: number;
  /** Ciqual alim_code the nutrients come from. */
  ciqualCode: string;
  meta: ExternalDataMeta;
}

interface FoodDefinition {
  id: string;
  name: { fr: string; en: string };
  category: FoodCategory;
  allergens?: Allergen[];
  animal?: AnimalOrigin;
  gramsPerPiece?: number;
}

/**
 * Editorial part of each food (name shown, category, allergens, animal origin, piece mass): Ciqual
 * does not describe allergens or diets, so these are Project You's own, reviewed with the
 * constraint tests. Nutrients always come from Ciqual (`CIQUAL_CODES`, D-020).
 */
function food(
  id: string,
  fr: string,
  en: string,
  category: FoodCategory,
  extra: Omit<FoodDefinition, 'id' | 'name' | 'category'> = {},
): FoodDefinition {
  return { id, name: { fr, en }, category, ...extra };
}

const DEFINITIONS: readonly FoodDefinition[] = [
  food('chicken_breast', 'Blanc de poulet (cru)', 'Chicken breast (raw)', 'protein', { animal: 'meat' }),
  food('ground_beef_5', 'Steak haché 5 % (cru)', 'Lean ground beef 5% (raw)', 'protein', { animal: 'meat' }),
  food('tuna_canned', 'Thon au naturel (égoutté)', 'Canned tuna in water (drained)', 'protein', {
    animal: 'fish',
    allergens: ['fish'],
  }),
  food('salmon', "Saumon d'élevage (cru)", 'Farmed salmon (raw)', 'protein', { animal: 'fish', allergens: ['fish'] }),
  food('egg', 'Œuf', 'Egg', 'protein', { animal: 'egg', allergens: ['eggs'], gramsPerPiece: 55 }),
  food('tofu', 'Tofu nature', 'Plain tofu', 'protein', { allergens: ['soy'] }),
  food('tempeh', 'Tempeh', 'Tempeh', 'protein', { allergens: ['soy'] }),
  food('seitan', 'Seitan', 'Seitan', 'protein', { allergens: ['gluten'] }),
  food('tvp_rehydrated', 'Protéines de soja texturées (réhydratées)', 'Textured soy protein (rehydrated)', 'protein', {
    allergens: ['soy'],
  }),
  food('soy_yogurt', 'Dessert au soja nature, sans sucres ajoutés', 'Plain unsweetened soy yogurt', 'dairy', {
    allergens: ['soy'],
  }),
  food('cottage_cheese', 'Fromage blanc 0 %', 'Fat-free quark', 'dairy', { animal: 'dairy', allergens: ['milk'] }),
  food('emmental', 'Emmental râpé', 'Grated emmental', 'dairy', { animal: 'dairy', allergens: ['milk'] }),
  food('soy_drink', 'Boisson au soja nature', 'Plain soy drink', 'dairy', { allergens: ['soy'] }),
  food('oats', "Flocons d'avoine", 'Rolled oats', 'grain', { allergens: ['gluten'] }),
  food('rice', 'Riz blanc (cru)', 'White rice (dry)', 'grain'),
  food('pasta', 'Pâtes sèches (crues)', 'Pasta (dry)', 'grain', { allergens: ['gluten'] }),
  food('wholemeal_bread', 'Pain complet', 'Wholemeal bread', 'grain', { allergens: ['gluten'] }),
  food('rice_cakes', 'Galettes de riz complet soufflé', 'Puffed brown rice cakes', 'grain'),
  food('potato', 'Pomme de terre (crue)', 'Potato (raw)', 'vegetable'),
  food('lentils', 'Lentilles (sèches)', 'Lentils (dry)', 'legume'),
  food('chickpeas_canned', 'Pois chiches en conserve (égouttés)', 'Canned chickpeas (drained)', 'legume'),
  food('red_beans_canned', 'Haricots rouges en conserve (égouttés)', 'Canned kidney beans (drained)', 'legume'),
  food('broccoli', 'Brocoli', 'Broccoli', 'vegetable'),
  food('carrot', 'Carotte', 'Carrot', 'vegetable'),
  food('tomato', 'Tomate', 'Tomato', 'vegetable'),
  food('spinach', 'Épinards', 'Spinach', 'vegetable'),
  food('frozen_veg_mix', 'Mélange de légumes surgelés', 'Frozen mixed vegetables', 'vegetable'),
  food('onion', 'Oignon', 'Onion', 'vegetable'),
  food('banana', 'Banane', 'Banana', 'fruit', { gramsPerPiece: 120 }),
  food('apple', 'Pomme', 'Apple', 'fruit', { gramsPerPiece: 150 }),
  food('raspberries', 'Framboises', 'Raspberries', 'fruit'),
  food('olive_oil', "Huile d'olive", 'Olive oil', 'fat'),
  food('peanut_butter', 'Beurre de cacahuète', 'Peanut butter', 'nut_seed', { allergens: ['peanuts'] }),
  food('almonds', 'Amandes', 'Almonds', 'nut_seed', { allergens: ['nuts'] }),
  food('tomato_sauce', 'Sauce tomate aux oignons', 'Tomato and onion sauce', 'condiment'),
  // Curry blends often contain mustard: flagged as a precaution.
  food('curry_powder', 'Curry en poudre', 'Curry powder', 'condiment', { allergens: ['mustard'] }),
];

/** Builds a food from Ciqual; a food without complete energy and macro values is not usable. */
export function fromCiqual(definition: FoodDefinition, code: string | undefined): Food | null {
  const source = code ? ciqualFood(code) : undefined;
  if (!source || !code) return null;
  const { energyKcal, proteinG, carbsG, fatG } = source.values;
  if (energyKcal.value === null || proteinG.value === null || carbsG.value === null || fatG.value === null) return null;
  return {
    id: definition.id,
    name: definition.name,
    category: definition.category,
    per100g: { kcal: energyKcal.value, proteinG: proteinG.value, carbsG: carbsG.value, fatG: fatG.value },
    allergens: definition.allergens ?? [],
    animal: definition.animal ?? null,
    gramsPerPiece: definition.gramsPerPiece,
    ciqualCode: code,
    meta: ciqualMeta(code),
  };
}

/** Foods whose Ciqual data is incomplete are left out (never filled in), and a test fails. */
export const FOOD_CATALOG: readonly Food[] = DEFINITIONS.map((d) => fromCiqual(d, CIQUAL_CODES[d.id])).filter(
  (f): f is Food => f !== null,
);

/** Ids of foods defined editorially, for the consistency tests. */
export const FOOD_DEFINITION_IDS: readonly string[] = DEFINITIONS.map((d) => d.id);

const BY_ID = new Map(FOOD_CATALOG.map((f) => [f.id, f]));

export function getFood(id: string): Food | undefined {
  return BY_ID.get(id);
}

/** True when one of these foods carries demo data (none since the Ciqual import; kept for the MOCK badge). */
export function hasMockFood(foodIds: readonly string[]): boolean {
  return foodIds.some((id) => getFood(id)?.meta.isMock === true);
}

export function nutrientsFor(food: Food, grams: number): Nutrients {
  const factor = grams / 100;
  return {
    kcal: food.per100g.kcal * factor,
    proteinG: food.per100g.proteinG * factor,
    carbsG: food.per100g.carbsG * factor,
    fatG: food.per100g.fatG * factor,
  };
}

export function sumNutrients(items: Nutrients[]): Nutrients {
  return items.reduce(
    (acc, n) => ({
      kcal: acc.kcal + n.kcal,
      proteinG: acc.proteinG + n.proteinG,
      carbsG: acc.carbsG + n.carbsG,
      fatG: acc.fatG + n.fatG,
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}
