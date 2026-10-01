import { expect, test, type Page } from '@playwright/test';

import { adaptRecipe, constraintsFrom } from '../src/domain/meals/constraints';
import { RECIPES } from '../src/domain/meals/recipes';
import { SCENARIOS } from '../src/domain/scenarios';
import { EXERCISES, isAvailable } from '../src/domain/training/exercises';

import { button, collectErrors, freezeClock, openTab, seedProfile, text } from './helpers';

test.beforeEach(async ({ page }) => {
  await freezeClock(page);
});

type Scenario = (typeof SCENARIOS)[keyof typeof SCENARIOS];

/** Recipe names that cannot be made compliant for this profile: they must never be shown. */
function forbiddenRecipes(s: Scenario): string[] {
  const c = constraintsFrom(s.nutrition, s.lifestyle.kitchen);
  return RECIPES.filter((r) => adaptRecipe(r, c) === null).map((r) => r.name.fr);
}

async function visibleText(page: Page): Promise<string> {
  return page.locator('body').innerText();
}

/** Names are compared to whole lines ("Tirage vertical" must not match "Tirage vertical élastique"). */
async function expectNone(page: Page, names: string[]) {
  const lines = new Set((await visibleText(page)).split('\n').map((l) => l.trim()));
  expect(names.filter((n) => lines.has(n))).toEqual([]);
}

for (const key of ['vegan', 'veganFatLoss', 'multipleAllergies', 'studentLowBudget'] as const) {
  test(`meals respect the hard constraints: ${key}`, async ({ page }) => {
    const errors = collectErrors(page);
    const scenario = SCENARIOS[key];
    const forbidden = forbiddenRecipes(scenario);
    expect(forbidden.length).toBeGreaterThan(0);
    await seedProfile(page, scenario);
    await page.goto('/nutrition');
    await expect(text(page, /Protéines prévues aujourd’hui/)).toBeVisible();
    await expect(page.getByText('MOCK').filter({ visible: true }).first()).toBeVisible();
    await expectNone(page, forbidden);
    expect(errors).toEqual([]);
  });
}

test('low budget: the shopping list never shows an invented price', async ({ page }) => {
  await seedProfile(page, SCENARIOS.studentLowBudget);
  await page.goto('/shopping');
  await expect(text(page, 'Liste de courses')).toBeVisible();
  expect(await visibleText(page)).not.toMatch(/\d+[,.]\d{2}\s?€/);
});

test('no gym: every planned exercise uses equipment the user has', async ({ page }) => {
  const scenario = SCENARIOS.noGym;
  const unavailable = EXERCISES.filter((e) => !isAvailable(e, scenario.training.equipment)).map((e) => e.name.fr);
  expect(unavailable.length).toBeGreaterThan(0);
  await seedProfile(page, scenario);
  await page.goto('/program');
  const open = page.getByRole('button', { name: 'Ouvrir la séance' }).filter({ visible: true });
  await expect(open.first()).toBeVisible();
  const count = await open.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await open.nth(i).click();
    await expect(text(page, 'Terminer la séance')).toBeVisible();
    await expectNone(page, unavailable);
    await page.goBack();
  }
});

test('busy schedule: sessions still fit, with a warning if not all could be placed', async ({ page }) => {
  const errors = collectErrors(page);
  await seedProfile(page, SCENARIOS.busySchedule);
  await page.goto('/program');
  await expect(text(page, 'Ton programme')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ouvrir la séance' }).filter({ visible: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('"Je n’ai pas envie": gentle options, rest is accepted without guilt', async ({ page }) => {
  await seedProfile(page, SCENARIOS.beginner);
  await page.goto('/');
  await button(page, 'Je n’ai pas envie').click();
  await expect(text(page, 'Pas envie ? Commence petit, tu décideras ensuite.')).toBeVisible();
  await expect(button(page, 'Marche de 20 minutes')).toBeVisible();
  await button(page, 'Repos aujourd’hui').click();
  await expect(text(page, 'Repos noté. À demain !')).toBeVisible();
});

test('"J’ai 15 minutes": offers a short session that counts', async ({ page }) => {
  await seedProfile(page, SCENARIOS.beginner);
  await page.goto('/');
  await openTab(page, 'Aujourd’hui');
  await button(page, 'J’ai 15 minutes').click();
  await expect(text(page, 'Peu de temps ? Une séance courte compte vraiment.')).toBeVisible();
  await expect(button(page, 'Séance courte (15–20 min)')).toBeVisible();
});
