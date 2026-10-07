import { expect, test } from '@playwright/test';

import { SCENARIOS } from '../src/domain/scenarios';
import { button, collectErrors, field, freezeClock, seedProfile, text } from './helpers';

/** D-043: Project You is for adults (18+, from the birth year). Under 18, the questionnaire stops. */

const TOO_YOUNG = /réservé aux personnes de 18 ans et plus/;

test.beforeEach(async ({ page }) => {
  await freezeClock(page);
});

test('onboarding: a birth year under 18 stops the questionnaire, 18 continues', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  const local = page.getByRole('button', { name: 'Continuer sans compte (sur cet appareil)' });
  const name = page.getByLabel('Prénom ou pseudo');
  await expect(local.or(name).first()).toBeVisible();
  if (await local.isVisible()) await local.click();
  await name.fill('Camille');
  await button(page, 'Continuer').click();

  await expect(text(page, /adultes \(18 ans et plus\)/)).toBeVisible();
  await page.getByLabel('Année de naissance').fill('2009');
  await expect(text(page, TOO_YOUNG)).toBeVisible();
  await expect(button(page, 'Continuer')).toBeDisabled();

  await page.getByLabel('Année de naissance').fill('2008');
  await expect(text(page, TOO_YOUNG)).toHaveCount(0);
  await button(page, 'Continuer').click();
  await expect(page.getByLabel('Taille (cm)')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Réglages: a birth year under 18 cannot be saved', async ({ page }) => {
  await seedProfile(page, SCENARIOS.muscleGain);
  await page.goto('/settings/profile');
  await field(page, 'Année de naissance').fill('2010');
  await expect(text(page, TOO_YOUNG)).toBeVisible();
  await expect(button(page, 'Enregistrer')).toBeDisabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('py.profile.v1')!).state.snapshot.user.birthYear)).toBe(
    SCENARIOS.muscleGain.user.birthYear,
  );
});
