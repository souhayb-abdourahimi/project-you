import { test, type Page } from '@playwright/test';

import { seedProfile } from '../../e2e/helpers';
import { SCENARIOS } from '../../src/domain/scenarios';

/**
 * D-046 quality pass: the new onboarding answers, honest empty states and the OpenStreetMap
 * errors. Captures only, no assertion; the same clock as the E2E tests.
 */
const WEDNESDAY = new Date(2026, 8, 30, 10, 0);

async function shot(page: Page, name: string, full = false) {
  const size = page.viewportSize()!;
  if (full) await page.setViewportSize({ width: size.width, height: 2400 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `screens/${test.info().project.name}/${name}.png` });
  if (full) await page.setViewportSize(size);
}

const next = (page: Page) => page.getByTestId('onboarding-next').click();
const choose = (page: Page, name: RegExp) =>
  page.getByRole('radio', { name }).or(page.getByRole('checkbox', { name })).first().click();

test('onboarding: single choice, motivations, target, budget, diet', async ({ page }) => {
  const en = test.info().project.name.endsWith('-en');
  await page.clock.setFixedTime(WEDNESDAY);
  await page.goto('/');
  const local = page.getByRole('button', { name: /Continuer sans compte|Continue without an account/ });
  const name = page.getByRole('textbox').first();
  await local.or(name).first().waitFor();
  if (await local.isVisible()) await local.click();
  await name.fill('Sam');
  await next(page);
  await page.getByRole('textbox').first().fill('1990');
  await next(page);
  const boxes = page.getByRole('textbox');
  await boxes.nth(0).fill('180');
  await boxes.nth(1).fill('90');
  await next(page);
  await choose(page, en ? /^Male/ : /^Homme/);
  await next(page);
  await shot(page, 'onboarding-activity');
  await choose(page, en ? /^Moderate/ : /^Modérée/);
  await page.waitForTimeout(400);
  await shot(page, 'onboarding-goal');
  await choose(page, en ? /^Weight loss/ : /^Perte de poids/);
  await page.waitForTimeout(400);
  await shot(page, 'onboarding-target');
  await next(page);
  for (const r of en ? [/^Lose weight/, /^Improve my health/] : [/^Perdre du poids/, /^Améliorer ma santé/])
    await choose(page, r);
  await shot(page, 'onboarding-motivations', true);
  await next(page);
  await page.getByRole('radio').nth(2).click(); // a usual amount, one touch
  await shot(page, 'onboarding-budget');
  await next(page);
  await next(page); // kitchen: nothing chosen
  await shot(page, 'onboarding-diet', true);
});

test('nutrition: nothing noted yet, no expense noted', async ({ page }) => {
  await page.clock.setFixedTime(WEDNESDAY);
  await seedProfile(page, SCENARIOS.beginner);
  await page.goto('/nutrition');
  await page.waitForTimeout(800);
  await shot(page, 'nutrition-nothing-noted', true);
});

test('places: OpenStreetMap refuses the request, then offline', async ({ page, context }) => {
  await page.clock.setFixedTime(WEDNESDAY);
  await seedProfile(page, SCENARIOS.beginner);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 48.8566, longitude: 2.3522 });
  await page.route('**/api/interpreter', (route) => route.fulfill({ status: 406, body: 'Not Acceptable' }));
  await page.goto('/places');
  await page.getByRole('button', { name: /Chercher autour de moi|Search around me/ }).click();
  await page.getByRole('alert').first().waitFor();
  await shot(page, 'places-error');
  await context.setOffline(true);
  await page.getByRole('button', { name: /Réessayer|Try again/ }).click();
  await page.waitForTimeout(400);
  await shot(page, 'places-offline');
  await context.setOffline(false);
});

test('photo analysis: no service, composing by hand', async ({ page }) => {
  await page.clock.setFixedTime(WEDNESDAY);
  await seedProfile(page, SCENARIOS.beginner);
  await page.goto('/meal-analysis');
  await page.waitForTimeout(600);
  await shot(page, 'meal-analysis-unavailable');
});
