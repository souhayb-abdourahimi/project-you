import { validatedMedia, type MediaRegistry, type ValidatedMedia } from '@/features/media/registry';

/**
 * Recipe media registry (W-10): `recipe.id -> validated Project You photo of that exact dish`.
 * Never a generic food picture: a photo of "a bowl with chicken" is not the photo of
 * `chicken_rice_broccoli` unless it was made from that recipe. Empty until the photos are produced
 * and reviewed (docs/EXERCISE_MEDIA.md § Recettes); the UI draws its artwork meanwhile.
 */
export const RECIPE_MEDIA: MediaRegistry = {};

export function recipeMedia(recipeId: string, registry: MediaRegistry = RECIPE_MEDIA): ValidatedMedia | null {
  return validatedMedia(registry, recipeId);
}
