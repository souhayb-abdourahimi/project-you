import type { KitchenEquipment } from '../profile/schemas';

export type MealSlot = 'breakfast' | 'lunch' | 'snack' | 'dinner';

export interface Ingredient {
  foodId: string;
  /** Grams for one base serving. */
  grams: number;
}

export interface Recipe {
  id: string;
  name: { fr: string; en: string };
  slots: MealSlot[];
  ingredients: Ingredient[];
  minutes: number;
  difficulty: 1 | 2 | 3;
  /** All of these are required. An empty list means no cooking appliance is needed. */
  equipment: KitchenEquipment[];
  steps: { fr: string[]; en: string[] };
  /** foodId → foods that can replace it one-for-one. */
  substitutions: Record<string, string[]>;
}

/** Editorial recipes (Project You). Nutrition is computed from the food catalogue, never typed in. */
export const RECIPES: readonly Recipe[] = [
  {
    id: 'overnight_oats',
    name: { fr: 'Overnight oats aux fruits rouges', en: 'Berry overnight oats' },
    slots: ['breakfast'],
    ingredients: [
      { foodId: 'oats', grams: 60 },
      { foodId: 'skyr', grams: 150 },
      { foodId: 'frozen_berries', grams: 80 },
    ],
    minutes: 5,
    difficulty: 1,
    equipment: [],
    steps: {
      fr: ["Mélanger l'avoine et le skyr.", 'Ajouter les fruits rouges.', 'Laisser une nuit au frais.'],
      en: ['Mix oats and skyr.', 'Add the berries.', 'Leave overnight in the fridge.'],
    },
    substitutions: { skyr: ['greek_yogurt', 'cottage_cheese', 'soy_drink'], frozen_berries: ['banana', 'apple'] },
  },
  {
    id: 'vegan_oats',
    name: { fr: 'Porridge soja-banane', en: 'Soy banana porridge' },
    slots: ['breakfast'],
    ingredients: [
      { foodId: 'oats', grams: 60 },
      { foodId: 'soy_drink', grams: 250 },
      { foodId: 'banana', grams: 120 },
    ],
    minutes: 5,
    difficulty: 1,
    equipment: ['microwave'],
    steps: {
      fr: ["Chauffer l'avoine avec la boisson soja 2 minutes.", 'Ajouter la banane en rondelles.'],
      en: ['Microwave oats with soy drink for 2 minutes.', 'Top with sliced banana.'],
    },
    substitutions: { banana: ['apple', 'frozen_berries'] },
  },
  {
    id: 'egg_toast',
    name: { fr: 'Tartines aux œufs brouillés', en: 'Scrambled eggs on toast' },
    slots: ['breakfast', 'dinner'],
    ingredients: [
      { foodId: 'egg', grams: 165 },
      { foodId: 'wholemeal_bread', grams: 80 },
      { foodId: 'tomato', grams: 100 },
    ],
    minutes: 10,
    difficulty: 1,
    equipment: ['stove'],
    steps: {
      fr: ['Brouiller les œufs à feu doux.', 'Servir sur le pain grillé avec la tomate.'],
      en: ['Scramble the eggs over low heat.', 'Serve on toast with tomato.'],
    },
    substitutions: { tomato: ['spinach'] },
  },
  {
    id: 'yogurt_bowl',
    name: { fr: 'Bol fromage blanc, pomme et amandes', en: 'Quark bowl with apple and almonds' },
    slots: ['breakfast', 'snack'],
    ingredients: [
      { foodId: 'cottage_cheese', grams: 200 },
      { foodId: 'apple', grams: 150 },
      { foodId: 'almonds', grams: 15 },
    ],
    minutes: 3,
    difficulty: 1,
    equipment: [],
    steps: { fr: ['Couper la pomme.', 'Mélanger le tout.'], en: ['Slice the apple.', 'Mix everything.'] },
    substitutions: { almonds: ['oats'], cottage_cheese: ['skyr', 'greek_yogurt'] },
  },
  {
    id: 'pb_banana_snack',
    name: { fr: 'Banane et beurre de cacahuète', en: 'Banana with peanut butter' },
    slots: ['snack'],
    ingredients: [
      { foodId: 'banana', grams: 120 },
      { foodId: 'peanut_butter', grams: 20 },
    ],
    minutes: 2,
    difficulty: 1,
    equipment: [],
    steps: { fr: ['Tartiner la banane.'], en: ['Spread peanut butter on the banana.'] },
    substitutions: { peanut_butter: ['almonds'] },
  },
  {
    id: 'chicken_rice_broccoli',
    name: { fr: 'Poulet, riz et brocoli', en: 'Chicken, rice and broccoli' },
    slots: ['lunch', 'dinner'],
    ingredients: [
      { foodId: 'chicken_breast', grams: 150 },
      { foodId: 'rice', grams: 80 },
      { foodId: 'broccoli', grams: 150 },
      { foodId: 'olive_oil', grams: 8 },
    ],
    minutes: 25,
    difficulty: 1,
    equipment: ['stove'],
    steps: {
      fr: ['Cuire le riz.', 'Saisir le poulet émincé dans l’huile.', 'Cuire le brocoli à la vapeur ou à l’eau.'],
      en: ['Cook the rice.', 'Sear the sliced chicken in oil.', 'Steam or boil the broccoli.'],
    },
    substitutions: { chicken_breast: ['tofu', 'tuna_canned'], rice: ['pasta', 'potato'], broccoli: ['frozen_veg_mix'] },
  },
  {
    id: 'tuna_pasta',
    name: { fr: 'Pâtes au thon et sauce tomate', en: 'Tuna tomato pasta' },
    slots: ['lunch', 'dinner'],
    ingredients: [
      { foodId: 'pasta', grams: 90 },
      { foodId: 'tuna_canned', grams: 120 },
      { foodId: 'tomato_sauce', grams: 150 },
      { foodId: 'onion', grams: 50 },
    ],
    minutes: 15,
    difficulty: 1,
    equipment: ['stove'],
    steps: {
      fr: ['Cuire les pâtes.', "Faire revenir l'oignon, ajouter la sauce et le thon.", 'Mélanger.'],
      en: ['Cook the pasta.', 'Sweat the onion, add sauce and tuna.', 'Combine.'],
    },
    substitutions: { tuna_canned: ['chickpeas_canned', 'ground_beef_5'], pasta: ['rice'] },
  },
  {
    id: 'lentil_curry',
    name: { fr: 'Curry de lentilles', en: 'Lentil curry' },
    slots: ['lunch', 'dinner'],
    ingredients: [
      { foodId: 'lentils', grams: 80 },
      { foodId: 'rice', grams: 60 },
      { foodId: 'spinach', grams: 100 },
      { foodId: 'curry_paste', grams: 20 },
      { foodId: 'onion', grams: 50 },
    ],
    minutes: 30,
    difficulty: 2,
    equipment: ['stove'],
    steps: {
      fr: ["Faire revenir l'oignon et la pâte de curry.", 'Ajouter les lentilles et 3 volumes d’eau, cuire 20 min.', 'Ajouter les épinards, servir avec le riz.'],
      en: ['Sweat onion with curry paste.', 'Add lentils and 3 volumes of water, simmer 20 min.', 'Stir in spinach, serve with rice.'],
    },
    substitutions: { spinach: ['frozen_veg_mix'], curry_paste: ['tomato_sauce'] },
  },
  {
    id: 'tofu_stir_fry',
    name: { fr: 'Poêlée de tofu et légumes', en: 'Tofu vegetable stir-fry' },
    slots: ['lunch', 'dinner'],
    ingredients: [
      { foodId: 'tofu', grams: 180 },
      { foodId: 'frozen_veg_mix', grams: 250 },
      { foodId: 'rice', grams: 70 },
      { foodId: 'olive_oil', grams: 8 },
    ],
    minutes: 20,
    difficulty: 1,
    equipment: ['stove'],
    steps: {
      fr: ['Cuire le riz.', 'Dorer le tofu en dés.', 'Ajouter les légumes et cuire 8 minutes.'],
      en: ['Cook the rice.', 'Brown the diced tofu.', 'Add the vegetables and cook 8 minutes.'],
    },
    substitutions: { tofu: ['chicken_breast', 'chickpeas_canned'], rice: ['pasta'] },
  },
  {
    id: 'chickpea_salad',
    name: { fr: 'Salade de pois chiches', en: 'Chickpea salad' },
    slots: ['lunch'],
    ingredients: [
      { foodId: 'chickpeas_canned', grams: 200 },
      { foodId: 'tomato', grams: 150 },
      { foodId: 'carrot', grams: 80 },
      { foodId: 'olive_oil', grams: 10 },
      { foodId: 'wholemeal_bread', grams: 60 },
    ],
    minutes: 10,
    difficulty: 1,
    equipment: [],
    steps: {
      fr: ['Rincer les pois chiches.', 'Couper tomate et carotte.', "Assaisonner avec l'huile, servir avec le pain."],
      en: ['Rinse the chickpeas.', 'Chop tomato and carrot.', 'Dress with oil, serve with bread.'],
    },
    substitutions: { chickpeas_canned: ['red_beans_canned', 'tuna_canned'] },
  },
  {
    id: 'chili_sin_carne',
    name: { fr: 'Chili sin carne', en: 'Bean chili' },
    slots: ['lunch', 'dinner'],
    ingredients: [
      { foodId: 'red_beans_canned', grams: 200 },
      { foodId: 'tomato_sauce', grams: 150 },
      { foodId: 'onion', grams: 60 },
      { foodId: 'rice', grams: 60 },
    ],
    minutes: 25,
    difficulty: 1,
    equipment: ['stove'],
    steps: {
      fr: ["Faire revenir l'oignon.", 'Ajouter haricots et sauce, mijoter 15 min.', 'Servir avec le riz.'],
      en: ['Sweat the onion.', 'Add beans and sauce, simmer 15 min.', 'Serve with rice.'],
    },
    substitutions: { red_beans_canned: ['chickpeas_canned', 'ground_beef_5'] },
  },
  {
    id: 'salmon_potatoes',
    name: { fr: 'Saumon, pommes de terre et épinards', en: 'Salmon, potatoes and spinach' },
    slots: ['dinner'],
    ingredients: [
      { foodId: 'salmon', grams: 130 },
      { foodId: 'potato', grams: 250 },
      { foodId: 'spinach', grams: 120 },
    ],
    minutes: 30,
    difficulty: 2,
    equipment: ['oven'],
    steps: {
      fr: ['Cuire les pommes de terre au four 25 min à 200 °C.', 'Ajouter le saumon les 12 dernières minutes.', 'Faire tomber les épinards.'],
      en: ['Roast potatoes 25 min at 200 °C.', 'Add salmon for the last 12 minutes.', 'Wilt the spinach.'],
    },
    substitutions: { salmon: ['chicken_breast', 'tofu'], potato: ['rice'] },
  },
  {
    id: 'microwave_beef_bowl',
    name: { fr: 'Bol bœuf-légumes au micro-ondes', en: 'Microwave beef and veg bowl' },
    slots: ['lunch', 'dinner'],
    ingredients: [
      { foodId: 'ground_beef_5', grams: 130 },
      { foodId: 'frozen_veg_mix', grams: 200 },
      { foodId: 'potato', grams: 200 },
    ],
    minutes: 15,
    difficulty: 1,
    equipment: ['microwave'],
    steps: {
      fr: ['Cuire les pommes de terre en dés 8 min au micro-ondes.', 'Ajouter bœuf et légumes, cuire 5 min en remuant à mi-cuisson.', 'Vérifier que la viande est bien cuite.'],
      en: ['Microwave diced potatoes 8 min.', 'Add beef and vegetables, cook 5 min, stirring halfway.', 'Make sure the meat is cooked through.'],
    },
    substitutions: { ground_beef_5: ['red_beans_canned', 'tuna_canned'] },
  },
  {
    id: 'skyr_snack',
    name: { fr: 'Skyr et fruits rouges', en: 'Skyr with berries' },
    slots: ['snack'],
    ingredients: [
      { foodId: 'skyr', grams: 150 },
      { foodId: 'frozen_berries', grams: 80 },
    ],
    minutes: 2,
    difficulty: 1,
    equipment: [],
    steps: { fr: ['Mélanger.'], en: ['Mix.'] },
    substitutions: { skyr: ['greek_yogurt', 'soy_drink'] },
  },
  {
    id: 'apple_almonds_snack',
    name: { fr: 'Pomme et amandes', en: 'Apple and almonds' },
    slots: ['snack'],
    ingredients: [
      { foodId: 'apple', grams: 150 },
      { foodId: 'almonds', grams: 20 },
    ],
    minutes: 1,
    difficulty: 1,
    equipment: [],
    steps: { fr: ['Prêt à manger.'], en: ['Ready to eat.'] },
    substitutions: { almonds: ['peanut_butter'] },
  },
];

export function getRecipe(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}
