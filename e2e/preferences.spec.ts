import { expect, test, type Page } from '@playwright/test';

import { SCENARIOS } from '../src/domain/scenarios';

import { button, collectErrors, freezeClock, seedProfile, text } from './helpers';

/** Review B2: editing preferences never drops a health-critical answer silently (D-023). */

test.beforeEach(async ({ page }) => {
  await freezeClock(page);
});

async function restartQuestionnaire(page: Page) {
  await page.goto('/settings');
  await button(page, 'Refaire le questionnaire').click();
  await expect(page).toHaveURL(/onboarding/);
}

/** Clicks "Continuer" until the given step title is shown (every answer is prefilled). */
async function continueUntil(page: Page, title: string) {
  for (let i = 0; i < 40; i++) {
    if (await text(page, title).isVisible()) return;
    await button(page, 'Continuer').click();
  }
  throw new Error(`step "${title}" not reached`);
}

const recap = (page: Page, label: string, value: string | RegExp) =>
  expect(
    page.getByText(label).filter({ visible: true }).locator('..').filter({ hasText: value }).first(),
  ).toBeVisible();

test('after signing in again, the questionnaire is prefilled from the profile', async ({ page }) => {
  const errors = collectErrors(page);
  // Same storage state as right after a sign-in: the account profile, no local draft.
  await seedProfile(page, SCENARIOS.veganSoyAllergy);
  await restartQuestionnaire(page);
  await expect(page.getByRole('textbox').first()).toHaveValue('Charlie (MOCK)');
  await continueUntil(page, 'Ton plan de départ');
  await expect(text(page, 'Ton alimentation')).toBeVisible();
  await recap(page, 'Régime alimentaire', 'Vegan');
  await recap(page, 'Allergies', 'Soja');
  await recap(page, 'Intolérances', 'aucune');
  await recap(page, 'Aliments exclus', 'aucune');
  expect(errors).toEqual([]);
});

test('on a second device, the account profile wins over the old local draft', async ({ page }) => {
  const saved = SCENARIOS.multipleAllergies;
  // This device still holds an old questionnaire without any allergy.
  await page.addInitScript((snapshot) => {
    localStorage.setItem(
      'py.profile.v1',
      JSON.stringify({
        state: {
          snapshot,
          localMode: true,
          draft: {
            ...snapshot,
            nutrition: { ...snapshot.nutrition, allergies: [], intolerances: [], excludedFoods: [] },
          },
        },
        version: 1,
      }),
    );
  }, saved);
  await restartQuestionnaire(page);
  await continueUntil(page, 'Ton plan de départ');
  await recap(page, 'Allergies', /Gluten, Lait, Fruits à coque, Poisson/);
});

test('removing an allergy asks for an explicit confirmation', async ({ page }) => {
  await seedProfile(page, SCENARIOS.veganSoyAllergy);
  await restartQuestionnaire(page);
  await continueUntil(page, 'Allergies');
  await page.getByRole('checkbox', { name: 'Soja' }).click();
  await continueUntil(page, 'Ton plan de départ');
  await recap(page, 'Allergies', 'aucune');

  await button(page, 'Créer mon programme').click();
  await expect(text(page, 'Tu es sur le point de supprimer l’allergie suivante :')).toBeVisible();
  await expect(text(page, '- Soja')).toBeVisible();
  await expect(text(page, 'Confirmer ?')).toBeVisible();
  await expect(button(page, 'Créer mon programme')).toBeDisabled();

  // "No" goes back to the allergies, nothing is saved.
  await button(page, 'Non, garder mes allergies').click();
  await expect(page.getByRole('checkbox', { name: 'Soja' })).toBeVisible();
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('py.profile.v1')!).state.snapshot.nutrition);
  expect(kept.allergies).toEqual(['soy']);

  // "Yes" saves the change.
  await continueUntil(page, 'Ton plan de départ');
  await button(page, 'Créer mon programme').click();
  await button(page, 'Oui, supprimer').click();
  await expect(page).not.toHaveURL(/onboarding/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('py.profile.v1')!).state.snapshot.nutrition);
  expect(saved.allergies).toEqual([]);
});

test('finishing without removing an allergy saves without a confirmation', async ({ page }) => {
  await seedProfile(page, SCENARIOS.veganSoyAllergy);
  await restartQuestionnaire(page);
  await continueUntil(page, 'Ton plan de départ');
  await button(page, 'Créer mon programme').click();
  await expect(page).not.toHaveURL(/onboarding/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('py.profile.v1')!).state.snapshot.nutrition);
  expect(saved.allergies).toEqual(['soy']);
});
