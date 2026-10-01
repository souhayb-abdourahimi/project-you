import type { Allergen } from '../profile/schemas';
import { FOOD_CATALOG, type AnimalOrigin, type Food, type FoodCategory } from './catalog';

/**
 * Free-text exclusions and intolerances ("soja", "poissons", "fruits à coque"…) translated into
 * what the catalogue knows: allergens, animal origins, categories or specific foods (D-021).
 *
 * user text → normalised words → known meaning (dictionary) → internal targets → catalogue filter.
 * Unknown words fall back to whole-word matching on food names, never to a substring search
 * ("pomme" must not exclude "pomme de terre").
 */

export type ExclusionSource = 'excluded' | 'intolerance';

/** What a known word means. Every id has a label in `exclusions.meaning.<id>` (FR/EN). */
export type ExclusionMeaning =
  | 'soy'
  | 'fish'
  | 'tuna'
  | 'salmon'
  | 'seafood'
  | 'meat'
  | 'red_meat'
  | 'poultry'
  | 'pork'
  | 'lamb'
  | 'egg'
  | 'milk'
  | 'cheese'
  | 'gluten'
  | 'peanut'
  | 'nut'
  | 'almond'
  | 'sesame'
  | 'mustard'
  | 'celery'
  | 'lupin'
  | 'sulphite'
  | 'pulse'
  | 'vegetable'
  | 'fruit'
  | 'apple'
  | 'potato';

export interface ExclusionTargets {
  allergens: Allergen[];
  animals: Exclude<AnimalOrigin, null>[];
  categories: FoodCategory[];
  foodIds: string[];
}

export interface ResolvedExclusion extends ExclusionTargets {
  /** What the user typed, unchanged. */
  input: string;
  source: ExclusionSource;
  /** Known meanings found in the text; empty when only food names matched (or nothing). */
  meanings: ExclusionMeaning[];
}

type Rule = { meaning: ExclusionMeaning; words: string[] } & Partial<ExclusionTargets>;

/** Keys are normalised and singular (see `exclusionKey`). Several words can share a meaning. */
const RULES: Rule[] = [
  { meaning: 'soy', words: ['soja', 'soya', 'pst', 'soy', 'soybean'], allergens: ['soy'] },
  { meaning: 'fish', words: ['poisson', 'fish'], allergens: ['fish'], animals: ['fish'] },
  { meaning: 'tuna', words: ['thon', 'tuna'], foodIds: ['tuna_canned'] },
  { meaning: 'salmon', words: ['saumon', 'salmon'], foodIds: ['salmon'] },
  {
    meaning: 'seafood',
    words: ['fruit de mer', 'crustace', 'mollusque', 'crevette', 'seafood', 'shellfish', 'crustacean', 'mollusc'],
    allergens: ['crustaceans', 'molluscs'],
  },
  { meaning: 'meat', words: ['viande', 'meat', 'charcuterie'], animals: ['meat'] },
  {
    meaning: 'red_meat',
    words: ['viande rouge', 'boeuf', 'veau', 'steak', 'steak hache', 'beef', 'red meat'],
    foodIds: ['ground_beef_5'],
  },
  {
    meaning: 'poultry',
    words: ['volaille', 'poulet', 'dinde', 'chicken', 'turkey', 'poultry'],
    foodIds: ['chicken_breast'],
  },
  { meaning: 'pork', words: ['porc', 'cochon', 'jambon', 'lardon', 'pork', 'ham', 'bacon'], foodIds: [] },
  { meaning: 'lamb', words: ['agneau', 'mouton', 'lamb'], foodIds: [] },
  { meaning: 'egg', words: ['oeuf', 'egg'], allergens: ['eggs'], animals: ['egg'] },
  {
    meaning: 'milk',
    words: ['lait', 'lactose', 'laitier', 'produit laitier', 'proteine de lait', 'caseine', 'milk', 'dairy'],
    allergens: ['milk'],
  },
  { meaning: 'cheese', words: ['fromage', 'cheese'], foodIds: ['cottage_cheese', 'emmental'] },
  {
    meaning: 'gluten',
    words: ['gluten', 'ble', 'froment', 'seigle', 'orge', 'epeautre', 'wheat'],
    allergens: ['gluten'],
  },
  {
    meaning: 'peanut',
    words: ['arachide', 'cacahuete', 'cacahouete', 'beurre de cacahuete', 'peanut', 'peanut butter'],
    allergens: ['peanuts'],
  },
  {
    meaning: 'nut',
    words: [
      'noix',
      'fruit a coque',
      'noisette',
      'cajou',
      'noix de cajou',
      'pistache',
      'nut',
      'tree nut',
      'hazelnut',
      'cashew',
    ],
    allergens: ['nuts'],
  },
  { meaning: 'almond', words: ['amande', 'almond'], foodIds: ['almonds'] },
  { meaning: 'sesame', words: ['sesame'], allergens: ['sesame'] },
  { meaning: 'mustard', words: ['moutarde', 'mustard'], allergens: ['mustard'] },
  { meaning: 'celery', words: ['celeri', 'celery'], allergens: ['celery'] },
  { meaning: 'lupin', words: ['lupin'], allergens: ['lupin'] },
  { meaning: 'sulphite', words: ['sulfite', 'sulphite'], allergens: ['sulphites'] },
  { meaning: 'pulse', words: ['legumineuse', 'legume sec', 'pulse'], categories: ['legume'] },
  { meaning: 'vegetable', words: ['legume', 'vegetable'], categories: ['vegetable'] },
  { meaning: 'fruit', words: ['fruit'], categories: ['fruit'] },
  { meaning: 'apple', words: ['pomme', 'apple'], foodIds: ['apple'] },
  { meaning: 'potato', words: ['pomme de terre', 'patate', 'potato'], foodIds: ['potato'] },
];

/** Words left as they are when singularising (they end in s or x in the singular). */
const INVARIANT = new Set([
  'noix',
  'riz',
  'pois',
  'mais',
  'jus',
  'ananas',
  'cassis',
  'radis',
  'anchois',
  'houmous',
  'hummus',
  'couscous',
  'lupin',
]);
const STOP_WORDS = new Set([
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'l',
  'd',
  'et',
  'en',
  'a',
  'au',
  'aux',
  'of',
  'and',
  'the',
]);

/** Lowercase, no accents, œ → oe, punctuation as spaces. */
export function normalize(text: string): string {
  return text.toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function singular(word: string): string {
  if (word.length <= 3 || INVARIANT.has(word)) return word;
  if (word.endsWith('eaux') || word.endsWith('oux')) return word.slice(0, -1);
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** Normalised singular words: "Fruits à coque" → ["fruit", "a", "coque"]. */
export function exclusionWords(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(singular);
}

export function exclusionKey(text: string): string {
  return exclusionWords(text).join(' ');
}

const RULE_BY_WORD = new Map(RULES.flatMap((rule) => rule.words.map((w) => [exclusionKey(w), rule] as const)));

/** Words of a food's names (id, FR, EN), for whole-word matching. */
const FOOD_WORDS = new Map(
  FOOD_CATALOG.map((f) => [f.id, [f.id.replace(/_/g, ' '), f.name.fr, f.name.en].map(exclusionWords)]),
);

function containsSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((w, j) => haystack[i + j] === w)) return true;
  }
  return false;
}

/**
 * Meaning of one entry: the whole phrase first ("pomme de terre"), otherwise every known word in
 * it ("lait de soja" → milk and soy: excluding too much is safer than too little). Food names
 * are matched as whole words in addition, so "tempeh" or "brocolis" work without a rule.
 */
export function resolveExclusion(input: string, source: ExclusionSource): ResolvedExclusion {
  const words = exclusionWords(input);
  const phrase = RULE_BY_WORD.get(words.join(' '));
  const rules = phrase
    ? [phrase]
    : [...new Set(words.filter((w) => !STOP_WORDS.has(w)).flatMap((w) => RULE_BY_WORD.get(w) ?? []))];
  const content = words.filter((w) => !STOP_WORDS.has(w));
  const byName =
    content.length === 0
      ? []
      : [...FOOD_WORDS].filter(([, names]) => names.some((n) => containsSequence(n, words))).map(([id]) => id);
  return {
    input,
    source,
    meanings: rules.map((r) => r.meaning),
    allergens: [...new Set(rules.flatMap((r) => r.allergens ?? []))],
    animals: [...new Set(rules.flatMap((r) => r.animals ?? []))],
    categories: [...new Set(rules.flatMap((r) => r.categories ?? []))],
    // A known phrase decides alone ("pomme" = apple, not every food named "pomme …").
    foodIds: [...new Set([...rules.flatMap((r) => r.foodIds ?? []), ...(rules.length > 0 ? [] : byName)])],
  };
}

export function resolveExclusions(excludedFoods: string[], intolerances: string[]): ResolvedExclusion[] {
  return [
    ...excludedFoods.map((i) => resolveExclusion(i, 'excluded' as const)),
    ...intolerances.map((i) => resolveExclusion(i, 'intolerance' as const)),
  ].filter((e) => exclusionWords(e.input).length > 0);
}

export function excludes(exclusion: ExclusionTargets, food: Food): boolean {
  return (
    food.allergens.some((a) => exclusion.allergens.includes(a)) ||
    (food.animal !== null && exclusion.animals.includes(food.animal)) ||
    exclusion.categories.includes(food.category) ||
    exclusion.foodIds.includes(food.id)
  );
}

/** Catalogue foods removed by one entry: what the app shows as "understood". */
export function excludedFoods(exclusion: ExclusionTargets): Food[] {
  return FOOD_CATALOG.filter((f) => excludes(exclusion, f));
}

/** Ids referenced by the dictionary, for the consistency tests. */
export const EXCLUSION_RULE_FOOD_IDS: readonly string[] = RULES.flatMap((r) => r.foodIds ?? []);
