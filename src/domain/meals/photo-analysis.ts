/**
 * Meal photo analysis (W-10, docs/MEAL_PHOTO_ANALYSIS.md). The vision service only says WHAT is on
 * the plate (catalogue food ids) and, when it can, HOW MUCH (grams). Every number shown or saved is
 * computed here from the Ciqual values of the catalogue, so a portion edited by the user is
 * recomputed the same way. Nothing is guessed: an unknown food or portion leaves the meal
 * incomplete, and an incomplete meal has no total and cannot be saved.
 */
import type { MealPhotoDetection } from '../ai/schemas';
import type { IsoDate } from '../shared/dates';

import { getFood, nutrientsFor, sumNutrients, type Food, type Nutrients } from './catalog';
import type { MealSlot } from './recipes';

export const MAX_PORTION_G = 1500;

export interface DraftItem {
  /** Stable key in the draft (order of detection or of addition). */
  key: string;
  /** What the service saw, or the catalogue name for a food added by hand. */
  label: string;
  /** Catalogue food, or null when nothing in the catalogue matches. */
  foodId: string | null;
  /** Portion in grams, or null when unknown. */
  grams: number | null;
  /** Service confidence (0..1), null when not given or added by hand. */
  confidence: number | null;
  /** Ciqual estimate for this item, only when food and portion are both known. */
  nutrition: Nutrients | null;
}

export type DraftStatus = 'empty' | 'incomplete' | 'complete';

export interface MealDraft {
  origin: 'photo' | 'manual';
  items: DraftItem[];
  status: DraftStatus;
  /** Sum of the items, only when every item is complete. Never a partial sum shown as a total. */
  totals: Nutrients | null;
  missing: { food: number; portion: number };
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const roundNutrients = (n: Nutrients): Nutrients => ({
  kcal: Math.round(n.kcal),
  proteinG: round1(n.proteinG),
  carbsG: round1(n.carbsG),
  fatG: round1(n.fatG),
});

const validGrams = (grams: number | null): number | null =>
  grams !== null && Number.isFinite(grams) && grams > 0 && grams <= MAX_PORTION_G ? Math.round(grams) : null;

function itemOf(
  key: string,
  label: string,
  foodId: string | null,
  grams: number | null,
  confidence: number | null,
  lookup: (id: string) => Food | undefined,
): DraftItem {
  const food = foodId ? lookup(foodId) : undefined;
  const portion = validGrams(grams);
  return {
    key,
    label,
    foodId: food ? food.id : null,
    grams: portion,
    confidence,
    nutrition: food && portion !== null ? roundNutrients(nutrientsFor(food, portion)) : null,
  };
}

function finish(origin: MealDraft['origin'], items: DraftItem[]): MealDraft {
  const food = items.filter((i) => i.foodId === null).length;
  const portion = items.filter((i) => i.grams === null).length;
  const complete = items.length > 0 && items.every((i) => i.nutrition !== null);
  return {
    origin,
    items,
    status: items.length === 0 ? 'empty' : complete ? 'complete' : 'incomplete',
    totals: complete ? roundNutrients(sumNutrients(items.map((i) => i.nutrition!))) : null,
    missing: { food, portion },
  };
}

/** A validated detection → a draft. Ids absent from the catalogue are treated as unmatched. */
export function draftFromDetection(
  detection: MealPhotoDetection,
  lookup: (id: string) => Food | undefined = getFood,
): MealDraft {
  return finish(
    'photo',
    detection.items.map((d, i) => itemOf(`d${i}`, d.label, d.foodId, d.grams, d.confidence, lookup)),
  );
}

export function emptyDraft(origin: MealDraft['origin'] = 'manual'): MealDraft {
  return finish(origin, []);
}

const rebuild = (draft: MealDraft, items: DraftItem[], lookup: (id: string) => Food | undefined) =>
  finish(
    draft.origin,
    items.map((i) => itemOf(i.key, i.label, i.foodId, i.grams, i.confidence, lookup)),
  );

/** The user corrects a portion (null = unknown again). */
export function setPortion(
  draft: MealDraft,
  key: string,
  grams: number | null,
  lookup: (id: string) => Food | undefined = getFood,
): MealDraft {
  return rebuild(
    draft,
    draft.items.map((i) => (i.key === key ? { ...i, grams } : i)),
    lookup,
  );
}

/** The user picks the catalogue food for an item (corrects or matches it). */
export function setFood(
  draft: MealDraft,
  key: string,
  foodId: string,
  lookup: (id: string) => Food | undefined = getFood,
): MealDraft {
  return rebuild(
    draft,
    draft.items.map((i) => (i.key === key ? { ...i, foodId } : i)),
    lookup,
  );
}

export function removeItem(
  draft: MealDraft,
  key: string,
  lookup: (id: string) => Food | undefined = getFood,
): MealDraft {
  return rebuild(
    draft,
    draft.items.filter((i) => i.key !== key),
    lookup,
  );
}

/** Adds a catalogue food by hand; its portion starts unknown unless given (a piece mass is never assumed). */
export function addFood(
  draft: MealDraft,
  foodId: string,
  grams: number | null = null,
  lookup: (id: string) => Food | undefined = getFood,
): MealDraft {
  const food = lookup(foodId);
  if (!food) return draft;
  const n = draft.items.reduce((max, i) => Math.max(max, Number(i.key.replace(/\D/g, '')) || 0), 0) + 1;
  return rebuild(draft, [...draft.items, itemOf(`m${n}`, food.name.fr, food.id, grams, null, lookup)], lookup);
}

/** A meal the user added (photo estimate or composed by hand), confirmed and saved. */
export interface LoggedMeal {
  id: string;
  date: IsoDate;
  slot: MealSlot | null;
  source: 'photo_estimate' | 'manual';
  items: { foodId: string; grams: number }[];
  /** Ciqual estimate at the time of saving (labelled "estimation" everywhere). */
  nutrition: Nutrients;
  createdAt: string;
}

/**
 * The confirmed draft as a meal to save, or null when it is not complete. Only food ids and grams
 * are kept: no photo, no label typed by the service.
 */
export function toLoggedMeal(
  draft: MealDraft,
  input: { id: string; date: IsoDate; slot: MealSlot | null; at: string },
): LoggedMeal | null {
  if (draft.status !== 'complete' || !draft.totals) return null;
  return {
    id: input.id,
    date: input.date,
    slot: input.slot,
    source: draft.origin === 'photo' ? 'photo_estimate' : 'manual',
    items: draft.items.map((i) => ({ foodId: i.foodId!, grams: i.grams! })),
    nutrition: draft.totals,
    createdAt: input.at,
  };
}

/** Recomputes a saved meal from its items (e.g. after a sync), so stored totals never drift. */
export function loggedMealNutrition(
  items: readonly { foodId: string; grams: number }[],
  lookup: (id: string) => Food | undefined = getFood,
): Nutrients | null {
  const parts: Nutrients[] = [];
  for (const item of items) {
    const food = lookup(item.foodId);
    const grams = validGrams(item.grams);
    if (!food || grams === null) return null;
    parts.push(nutrientsFor(food, grams));
  }
  return parts.length > 0 ? roundNutrients(sumNutrients(parts)) : null;
}
