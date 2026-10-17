# W9 Nutrition Premium — handoff

Branch: `claude/w9-nutrition-premium`
Base: `claude/w9-premium-ui-oj4l4w`
Draft PR: #8

## Goal

Bring Nutrition closer to the premium mobile reference while preserving Project You's existing business rules:

- real logged data only;
- missing data is never displayed as zero;
- nutrition values remain estimates;
- no random or semantically wrong food imagery;
- meal-photo AI output is never fabricated and must be user-confirmed before persistence.

## Implemented

### Daily Nutrition

`src/features/nutrition/DayTargets.tsx`

- premium calorie ring;
- calories consumed from meals explicitly marked eaten;
- protein / carbs / fat bars;
- target warnings preserved;
- accessibility labels preserved;
- design-system colors/tokens used.

### Nutrition tab

`src/app/(tabs)/nutrition.tsx`

Three views:

- Day;
- Week;
- Recipes.

Day keeps the existing inventory, shopping, exclusions, diagnosis, budget and meal-plan logic.

Week uses only real meal marks. When intake is unknown, the UI shows an unavailable/unknown state instead of a zero-value chart.

Recipes lists recipes actually used by the generated weekly plan.

### Premium meal cards

`src/features/nutrition/MealCard.tsx`

- stronger visual hierarchy;
- kcal / protein / carbs / fat summary;
- eaten / skipped / replaced states;
- undo support;
- optional reason capture preserved;
- recipe details, ingredients, steps and alternatives preserved;
- existing inventory/adaptation/rationale logic preserved.

### Recipe media contract

`src/domain/meals/recipes.ts`
`src/features/nutrition/MealMedia.tsx`

Superseded in W-10 (D-045): `RECIPE_MEDIA` (`recipe.id -> ValidatedMedia`, `src/features/nutrition/recipeMedia.ts`) is the only image entry point; `Recipe.mediaUri` was removed.

Rule:

`recipe.id -> validated Project You media`

If no approved media is mapped, render the branded fallback. Never fetch or substitute a random web image.

### Meal photo analysis contract

`src/features/nutrition/mealAnalysis.ts`
`src/features/nutrition/MealAnalysisResultCard.tsx`
`src/features/nutrition/MealAnalysisScreen.tsx`

UI states already modelled:

- idle;
- analyzing;
- ready;
- error;
- invalid/incomplete result.

A usable analysis requires:

- a real image URI;
- at least one detected item;
- finite non-negative kcal/protein/carbs/fat totals.

Portion and confidence are allowed to be unknown (`null`) rather than guessed.

The result UI explicitly labels values as estimates and requires user confirmation.

Tests:

`src/features/nutrition/__tests__/mealAnalysis.test.ts`

## Intentionally not implemented yet

These require broader product/backend decisions and should not be silently improvised:

1. Photo acquisition
   - camera/photo-library dependency and permission UX;
   - compression/resizing before upload.

2. Analysis provider
   - API/provider choice;
   - server-side secret handling;
   - timeout/retry policy;
   - provider output -> `MealAnalysisResult` adapter.

3. Persistence of confirmed custom meals
   - current state model primarily tracks planned meals;
   - an analyzed ad-hoc meal needs a first-class persisted/synced record;
   - Supabase schema + sync projection + privacy/export/delete behavior must be updated together.

4. Final i18n pass
   - new Nutrition tabs and meal-analysis copy still contain some local FR/EN UI strings;
   - move them into `src/i18n/locales/fr.ts` and `en.ts`.

5. Approved food photography
   - map only validated assets in `RECIPE_MEDIA` (see `docs/MEDIA.md`);
   - no nutrition value should be inferred from those editorial images.

## Next implementation contract for Claude

When Claude takes over:

- stay on `claude/w9-nutrition-premium`;
- do not merge PR #8;
- first read this file, `docs/NUTRITION_ENGINE.md`, `docs/DATA_SOURCES.md`, `docs/PRIVACY.md`, and the current state/sync schema;
- preserve the current meal planner and safety rules;
- do not add a client-side AI secret;
- do not persist an analyzed meal before explicit user confirmation;
- do not treat skipped/replaced/unlogged meals as zero calories;
- add tests for every persistence/sync change;
- run lint, typecheck, Jest, database tests and web build before marking PR ready.

## Visual target

Premium light mobile UI:

- off-white background;
- white cards;
- blue primary accent;
- restrained nutrition teal;
- large card radii;
- subtle borders/shadows;
- compact data visualization;
- food photos only when semantically correct;
- clear text values next to every graph/ring.
