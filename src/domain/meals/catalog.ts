import type { Allergen } from '../profile/schemas';
import type { ExternalDataMeta } from '../shared/external';

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
  meta: ExternalDataMeta;
}

const MOCK_META: ExternalDataMeta = {
  provider: 'project-you-mock',
  externalId: null,
  source: 'MOCK — valeurs approximatives de démonstration, à remplacer par CIQUAL (ANSES)',
  fetchedAt: '2026-09-30T00:00:00.000Z',
  updatedAt: null,
  confidence: 'low',
  isMock: true,
};

function food(
  id: string,
  fr: string,
  en: string,
  category: FoodCategory,
  [kcal, proteinG, carbsG, fatG]: [number, number, number, number],
  extra: { allergens?: Allergen[]; animal?: AnimalOrigin; gramsPerPiece?: number } = {},
): Food {
  return {
    id,
    name: { fr, en },
    category,
    per100g: { kcal, proteinG, carbsG, fatG },
    allergens: extra.allergens ?? [],
    animal: extra.animal ?? null,
    gramsPerPiece: extra.gramsPerPiece,
    meta: MOCK_META,
  };
}

/** MOCK catalogue (see docs/DECISIONS.md D-011). Values are rough demo figures, not reference data. */
export const FOOD_CATALOG: readonly Food[] = [
  food('chicken_breast', 'Blanc de poulet', 'Chicken breast', 'protein', [120, 23, 0, 2], { animal: 'meat' }),
  food('ground_beef_5', 'Bœuf haché 5 %', 'Lean ground beef 5%', 'protein', [130, 21, 0, 5], { animal: 'meat' }),
  food('tuna_canned', 'Thon au naturel', 'Canned tuna', 'protein', [115, 26, 0, 1], {
    animal: 'fish',
    allergens: ['fish'],
  }),
  food('salmon', 'Saumon', 'Salmon', 'protein', [200, 20, 0, 13], { animal: 'fish', allergens: ['fish'] }),
  food('egg', 'Œuf', 'Egg', 'protein', [140, 12.5, 0.5, 10], { animal: 'egg', allergens: ['eggs'], gramsPerPiece: 55 }),
  food('tofu', 'Tofu ferme', 'Firm tofu', 'protein', [145, 15, 2, 8.5], { allergens: ['soy'] }),
  food('tempeh', 'Tempeh', 'Tempeh', 'protein', [190, 19, 9, 11], { allergens: ['soy'] }),
  food('seitan', 'Seitan', 'Seitan', 'protein', [140, 25, 6, 2], { allergens: ['gluten'] }),
  food('tvp', 'Protéines de soja texturées (sèches)', 'Textured soy protein (dry)', 'protein', [330, 50, 17, 1], {
    allergens: ['soy'],
  }),
  food('edamame', 'Edamame surgelés', 'Frozen edamame', 'legume', [120, 11, 9, 5], { allergens: ['soy'] }),
  food('soy_yogurt', 'Yaourt au soja nature', 'Plain soy yogurt', 'dairy', [50, 4, 2.5, 2.3], { allergens: ['soy'] }),
  food('greek_yogurt', 'Yaourt grec 0 %', 'Greek yogurt 0%', 'dairy', [60, 10, 4, 0.3], {
    animal: 'dairy',
    allergens: ['milk'],
  }),
  food('skyr', 'Skyr', 'Skyr', 'dairy', [62, 11, 4, 0.2], { animal: 'dairy', allergens: ['milk'] }),
  food('cottage_cheese', 'Fromage blanc 0 %', 'Fat-free quark', 'dairy', [48, 7.5, 4, 0.2], {
    animal: 'dairy',
    allergens: ['milk'],
  }),
  food('emmental', 'Emmental râpé', 'Grated emmental', 'dairy', [380, 28, 0.5, 29], {
    animal: 'dairy',
    allergens: ['milk'],
  }),
  food('soy_drink', 'Boisson au soja', 'Soy drink', 'dairy', [40, 3.3, 2.5, 1.8], { allergens: ['soy'] }),
  food('oats', "Flocons d'avoine", 'Rolled oats', 'grain', [370, 13, 60, 7], { allergens: ['gluten'] }),
  food('rice', 'Riz (cru)', 'Rice (dry)', 'grain', [355, 7, 78, 0.6]),
  food('pasta', 'Pâtes (crues)', 'Pasta (dry)', 'grain', [355, 12.5, 71, 1.5], { allergens: ['gluten'] }),
  food('wholemeal_bread', 'Pain complet', 'Wholemeal bread', 'grain', [245, 9, 43, 3], { allergens: ['gluten'] }),
  food('rice_cakes', 'Galettes de riz', 'Rice cakes', 'grain', [385, 8, 80, 3]),
  food('potato', 'Pomme de terre', 'Potato', 'vegetable', [80, 2, 17, 0.1]),
  food('lentils', 'Lentilles (sèches)', 'Lentils (dry)', 'legume', [335, 24, 50, 1.5]),
  food('chickpeas_canned', 'Pois chiches en conserve', 'Canned chickpeas', 'legume', [120, 7, 15, 2.5]),
  food('red_beans_canned', 'Haricots rouges en conserve', 'Canned kidney beans', 'legume', [95, 6.5, 13, 0.5]),
  food('broccoli', 'Brocoli', 'Broccoli', 'vegetable', [35, 3, 4, 0.4]),
  food('carrot', 'Carotte', 'Carrot', 'vegetable', [38, 0.8, 7.5, 0.2]),
  food('tomato', 'Tomate', 'Tomato', 'vegetable', [20, 0.9, 3, 0.2]),
  food('spinach', 'Épinards', 'Spinach', 'vegetable', [25, 2.8, 1.5, 0.4]),
  food('frozen_veg_mix', 'Poêlée de légumes surgelés', 'Frozen vegetable mix', 'vegetable', [45, 2, 6, 0.8]),
  food('onion', 'Oignon', 'Onion', 'vegetable', [35, 1, 7, 0.1]),
  food('banana', 'Banane', 'Banana', 'fruit', [90, 1.1, 21, 0.3], { gramsPerPiece: 120 }),
  food('apple', 'Pomme', 'Apple', 'fruit', [53, 0.3, 12, 0.2], { gramsPerPiece: 150 }),
  food('frozen_berries', 'Fruits rouges surgelés', 'Frozen berries', 'fruit', [45, 1, 8, 0.3]),
  food('olive_oil', "Huile d'olive", 'Olive oil', 'fat', [900, 0, 0, 100]),
  food('peanut_butter', 'Beurre de cacahuète', 'Peanut butter', 'nut_seed', [600, 25, 15, 50], {
    allergens: ['peanuts'],
  }),
  food('almonds', 'Amandes', 'Almonds', 'nut_seed', [600, 21, 8, 52], { allergens: ['nuts'] }),
  food('tomato_sauce', 'Sauce tomate', 'Tomato sauce', 'condiment', [45, 1.5, 7, 1]),
  food('curry_paste', 'Pâte de curry', 'Curry paste', 'condiment', [120, 2, 12, 7], { allergens: ['mustard'] }),
];

const BY_ID = new Map(FOOD_CATALOG.map((f) => [f.id, f]));

export function getFood(id: string): Food | undefined {
  return BY_ID.get(id);
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
