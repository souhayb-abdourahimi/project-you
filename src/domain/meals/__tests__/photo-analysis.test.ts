import { parseMealPhotoDetection } from '../../ai/schemas';
import { getFood, nutrientsFor } from '../catalog';
import {
  addFood,
  draftFromDetection,
  emptyDraft,
  loggedMealNutrition,
  removeItem,
  setFood,
  setPortion,
  toLoggedMeal,
} from '../photo-analysis';

const detection = (items: { label: string; foodId: string | null; grams: number | null }[]) => {
  const parsed = parseMealPhotoDetection({
    items: items.map((i) => ({ ...i, confidence: null })),
    model: 'test-model',
  });
  if (!parsed.ok) throw new Error('invalid fixture');
  return parsed.detection;
};

describe('meal photo detection schema', () => {
  it('rejects calories or macros sent by the service: nutrition is never taken from the model', () => {
    expect(
      parseMealPhotoDetection({
        items: [{ label: 'Poulet', foodId: 'chicken_breast', grams: 150, confidence: 0.8, kcal: 250 }],
        model: 'x',
      }).ok,
    ).toBe(false);
    expect(parseMealPhotoDetection({ items: [], model: 'x', totals: { kcal: 500 } }).ok).toBe(false);
  });

  it('rejects absurd portions, unknown shapes and more than 12 items', () => {
    const item = { label: 'Riz', foodId: 'rice', grams: 100, confidence: null };
    expect(parseMealPhotoDetection({ items: [{ ...item, grams: 0 }], model: 'x' }).ok).toBe(false);
    expect(parseMealPhotoDetection({ items: [{ ...item, grams: 5000 }], model: 'x' }).ok).toBe(false);
    expect(parseMealPhotoDetection({ items: [{ ...item, foodId: 'DROP TABLE' }], model: 'x' }).ok).toBe(false);
    expect(parseMealPhotoDetection({ items: Array(13).fill(item), model: 'x' }).ok).toBe(false);
    expect(parseMealPhotoDetection('not json').ok).toBe(false);
  });
});

describe('meal draft from a detection', () => {
  it('computes each item and the total from Ciqual, never from the service', () => {
    const draft = draftFromDetection(
      detection([
        { label: 'Poulet grillé', foodId: 'chicken_breast', grams: 150 },
        { label: 'Brocoli', foodId: 'broccoli', grams: 100 },
      ]),
    );
    const chicken = nutrientsFor(getFood('chicken_breast')!, 150);
    expect(draft.status).toBe('complete');
    expect(draft.items[0].nutrition?.kcal).toBe(Math.round(chicken.kcal));
    expect(draft.totals?.kcal).toBe(
      Math.round(chicken.kcal + nutrientsFor(getFood('broccoli')!, 100).kcal),
    );
  });

  it('an unknown portion or an unmatched food: incomplete, no total (never a partial sum)', () => {
    const draft = draftFromDetection(
      detection([
        { label: 'Poulet', foodId: 'chicken_breast', grams: null },
        { label: 'Sauce mystère', foodId: null, grams: 30 },
        { label: 'Riz', foodId: 'rice', grams: 80 },
      ]),
    );
    expect(draft.status).toBe('incomplete');
    expect(draft.totals).toBeNull();
    expect(draft.missing).toEqual({ food: 1, portion: 1 });
    expect(draft.items[0].nutrition).toBeNull();
    expect(draft.items[2].nutrition).not.toBeNull();
  });

  it('an id outside the catalogue is unmatched, not trusted', () => {
    const draft = draftFromDetection(detection([{ label: 'Pizza', foodId: 'pizza_margherita', grams: 200 }]));
    expect(draft.items[0].foodId).toBeNull();
    expect(draft.status).toBe('incomplete');
  });

  it('nothing detected: empty, nothing to save', () => {
    const draft = draftFromDetection(detection([]));
    expect(draft.status).toBe('empty');
    expect(toLoggedMeal(draft, { id: 'm', date: '2026-10-08', slot: null, at: 'now' })).toBeNull();
  });
});

describe('user corrections', () => {
  const base = () =>
    draftFromDetection(
      detection([
        { label: 'Poulet', foodId: 'chicken_breast', grams: null },
        { label: 'Sauce', foodId: null, grams: 40 },
      ]),
    );

  it('a portion entered by the user is recomputed the same way', () => {
    const draft = setPortion(base(), 'd0', 200);
    expect(draft.items[0].nutrition?.kcal).toBe(Math.round(nutrientsFor(getFood('chicken_breast')!, 200).kcal));
    expect(draft.status).toBe('incomplete');
  });

  it('matching the unknown food completes the meal; removing it too', () => {
    const matched = setFood(setPortion(base(), 'd0', 150), 'd1', 'tomato_sauce');
    expect(matched.status).toBe('complete');
    const removed = removeItem(setPortion(base(), 'd0', 150), 'd1');
    expect(removed.status).toBe('complete');
    expect(removed.items).toHaveLength(1);
  });

  it('an invalid portion stays unknown', () => {
    expect(setPortion(base(), 'd0', -5).items[0].grams).toBeNull();
    expect(setPortion(base(), 'd0', 99_999).items[0].grams).toBeNull();
  });

  it('a food added by hand starts without a portion (a piece mass is never assumed)', () => {
    const draft = addFood(emptyDraft(), 'banana');
    expect(draft.items[0].grams).toBeNull();
    expect(draft.status).toBe('incomplete');
    const done = setPortion(draft, draft.items[0].key, 120);
    expect(done.status).toBe('complete');
    expect(addFood(done, 'unknown_food')).toBe(done);
    expect(addFood(done, 'apple', 150).items.map((i) => i.key)).toEqual(['m1', 'm2']);
  });
});

describe('saving a confirmed meal', () => {
  it('keeps only food ids and grams, labelled as a photo estimate', () => {
    const draft = draftFromDetection(detection([{ label: 'Saumon grillé', foodId: 'salmon', grams: 120 }]));
    const meal = toLoggedMeal(draft, { id: 'm1', date: '2026-10-08', slot: 'dinner', at: '2026-10-08T19:00:00Z' });
    expect(meal).toEqual({
      id: 'm1',
      date: '2026-10-08',
      slot: 'dinner',
      source: 'photo_estimate',
      items: [{ foodId: 'salmon', grams: 120 }],
      nutrition: draft.totals,
      createdAt: '2026-10-08T19:00:00Z',
    });
    expect(JSON.stringify(meal)).not.toContain('Saumon grillé');
  });

  it('a saved meal is recomputed from its items; unknown items make it unknown', () => {
    expect(loggedMealNutrition([{ foodId: 'salmon', grams: 120 }])?.kcal).toBe(
      Math.round(nutrientsFor(getFood('salmon')!, 120).kcal),
    );
    expect(loggedMealNutrition([{ foodId: 'gone', grams: 120 }])).toBeNull();
    expect(loggedMealNutrition([])).toBeNull();
  });
});
