import { validatedMedia, type MediaRegistry, type ValidatedMedia } from '@/features/media/registry';

/**
 * Recipe media registry (W-10): `recipe.id -> validated Project You photo of that exact dish`.
 * Never a generic food picture: a photo of "a bowl with chicken" is not the photo of
 * `chicken_rice_broccoli` unless it shows that recipe's foods. The photo is decoration only: the
 * recipe's foods, grams and Ciqual values stay the source of truth, nothing is read from it.
 *
 * Batch 01 (2026-10-17): 1 photo matches an existing recipe. The 5 others show dishes the
 * catalogue does not have (smoothie bowl, penne with meatballs, scrambled eggs with spinach,
 * pancakes, salmon with quinoa); they stay in `assets/media/recipes/unlinked/`, unused, until a
 * recipe of that exact dish exists (docs/MEDIA.md § Recettes). The catalogue is never changed to
 * fit a picture.
 */
export const RECIPE_MEDIA: MediaRegistry = {
  chicken_rice_broccoli: {
    source: require('../../../assets/media/recipes/chicken_rice_broccoli.jpg'),
    status: 'validated',
    credit: 'Project You — lot médias recettes 01, validé par Souhayb',
    reviewedOn: '2026-10-17',
    size: { width: 249, height: 249 },
    focus: { x: 0.45, y: 0.45 },
    alt: {
      fr: 'Bol de riz blanc, blanc de poulet grillé et bouquets de brocoli',
      en: 'Bowl of white rice, grilled chicken breast and broccoli florets',
    },
  },
};

export function recipeMedia(recipeId: string, registry: MediaRegistry = RECIPE_MEDIA): ValidatedMedia | null {
  return validatedMedia(registry, recipeId);
}
