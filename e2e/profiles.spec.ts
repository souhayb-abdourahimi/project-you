import { expect, test, type Page } from '@playwright/test';

import { adaptRecipe, constraintsFrom } from '../src/domain/meals/constraints';
import { RECIPES } from '../src/domain/meals/recipes';
import { SCENARIOS, scenario } from '../src/domain/scenarios';

import { button, collectErrors, field, freezeClock, openTab, seedProfile, text } from './helpers';

/**
 * D-046 user profiles, end to end on the web build: what each one is asked, what is saved, and
 * what the screens show (real data only, "nothing noted" never drawn as 0).
 */

test.beforeEach(async ({ page }) => {
  await freezeClock(page);
});

const next = (page: Page) => page.getByTestId('onboarding-next').click();
const pick = (page: Page, name: string | RegExp) =>
  page
    .getByRole('radio', { name, exact: typeof name === 'string' })
    .or(page.getByRole('checkbox', { name, exact: typeof name === 'string' }))
    .first()
    .click();
const heading = (page: Page, name: string) => expect(page.getByRole('heading', { name })).toBeVisible();
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('py.profile.v1')!).state.snapshot);

test('standard user: no particular diet, weight loss, several motivations, a gym', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  const local = page.getByRole('button', { name: 'Continuer sans compte (sur cet appareil)' });
  const name = page.getByLabel('Prénom ou pseudo');
  await expect(local.or(name).first()).toBeVisible();
  if (await local.isVisible()) await local.click();

  await name.fill('Sam');
  await next(page);
  await page.getByLabel('Année de naissance').fill('1990');
  await next(page);
  await page.getByLabel('Taille (cm)').fill('180');
  await page.getByLabel('Poids (kg)').fill('90');
  await next(page);
  await pick(page, 'Homme');
  await next(page);
  await pick(page, /^Modérée/);
  await heading(page, 'Quel est ton objectif principal ?');
  await pick(page, /^Perte de poids/);
  await heading(page, 'As-tu un poids cible ?');
  // No target: the button says so, nobody has to invent one.
  await expect(page.getByTestId('onboarding-next')).toHaveText('Pas de poids cible');
  await next(page);
  await heading(page, 'Qu’est-ce qui te motive ?');
  for (const reason of [/^Perdre du poids/, /^Améliorer ma santé/, /^Prendre de bonnes habitudes/])
    await pick(page, reason);
  await next(page);
  await pick(page, /^50\s€$/);
  await next(page);
  await pick(page, 'Plaques');
  await next(page);
  await heading(page, 'Suis-tu un régime alimentaire particulier ?');
  await pick(page, /^Aucun régime particulier/);
  await heading(page, 'Allergies');
  await expect(page.getByTestId('onboarding-next')).toHaveText('Aucune allergie');
  await next(page);
  await next(page);
  await pick(page, '3');
  await pick(page, '30 min');
  await next(page);
  await pick(page, /^Oui, j’ai accès à une salle/);
  await heading(page, 'Ta salle');
  await next(page);
  await pick(page, /^Intermédiaire/);
  await heading(page, 'Combien de séances par semaine ?');
  await pick(page, '3');
  await pick(page, '60 min');
  await next(page);
  await next(page);
  await next(page);
  await heading(page, 'Ton plan de départ');
  await button(page, 'Créer mon programme').click();
  await expect(page).not.toHaveURL(/onboarding/);

  const snapshot = await stored(page);
  expect(snapshot.goal.type).toBe('weight_loss');
  expect(snapshot.motivation.reasons).toEqual(['weight', 'health', 'habits']);
  expect(snapshot.nutrition.diet).toBe('omnivore');
  expect(snapshot.nutrition.allergies).toEqual([]);
  expect(snapshot.training.hasGym).toBe(true);
  expect(snapshot.budget.weeklyFoodBudgetCents).toBe(5000);

  // Nothing eaten yet today: a dash and "nothing noted", never 0 g as if measured.
  await expect(text(page, 'Rien de noté pour l’instant')).toBeVisible();
  await openTab(page, 'Nutrition');
  await expect(text(page, /Rien de noté aujourd’hui pour l’instant/)).toBeVisible();
  // No expense noted is not "0 € spent".
  await expect(text(page, 'Aucune dépense notée cette semaine.')).toBeVisible();

  // The motivations are editable in Réglages, one source.
  await page.goto('/settings/motivation');
  await expect(page.getByRole('checkbox', { name: /^Améliorer ma santé/ })).toHaveAttribute('aria-checked', 'true');
  expect(errors).toEqual([]);
});

test('Back keeps the answers, and a single choice can be changed after moving on', async ({ page }) => {
  await page.goto('/');
  const local = page.getByRole('button', { name: 'Continuer sans compte (sur cet appareil)' });
  const name = page.getByLabel('Prénom ou pseudo');
  await expect(local.or(name).first()).toBeVisible();
  if (await local.isVisible()) await local.click();
  await name.fill('Alex');
  await next(page);
  await page.getByLabel('Année de naissance').fill('1995');
  await next(page);
  await page.getByLabel('Taille (cm)').fill('165');
  await page.getByLabel('Poids (kg)').fill('60');
  await next(page);
  await pick(page, 'Femme');
  await next(page);
  await pick(page, /^Sédentaire/);
  await heading(page, 'Quel est ton objectif principal ?');
  await button(page, 'Retour').click();
  await expect(page.getByRole('radio', { name: /^Sédentaire/ })).toHaveAttribute('aria-checked', 'true');
  await pick(page, /^Légère/);
  await heading(page, 'Quel est ton objectif principal ?');
  await button(page, 'Retour').click();
  await expect(page.getByRole('radio', { name: /^Légère/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: /^Sédentaire/ })).toHaveAttribute('aria-checked', 'false');
});

test('vegetarian: no meat or fish recipe is ever shown', async ({ page }) => {
  const errors = collectErrors(page);
  const vegetarian = scenario({ nutrition: { ...SCENARIOS.studentMediumBudget.nutrition, diet: 'vegetarian' } });
  const c = constraintsFrom(vegetarian.nutrition, vegetarian.lifestyle.kitchen);
  const forbidden = RECIPES.filter((r) => adaptRecipe(r, c) === null).map((r) => r.name.fr);
  expect(forbidden.length).toBeGreaterThan(0);
  await seedProfile(page, vegetarian);
  await page.goto('/nutrition');
  await expect(text(page, /Protéines prévues aujourd’hui/)).toBeVisible();
  const lines = new Set((await page.locator('body').innerText()).split('\n').map((l) => l.trim()));
  expect(forbidden.filter((n) => lines.has(n))).toEqual([]);
  expect(errors).toEqual([]);
});

test('experienced lifter: a full program, sessions to open', async ({ page }) => {
  const errors = collectErrors(page);
  await seedProfile(page, SCENARIOS.advanced);
  await page.goto('/program');
  await expect(text(page, 'Ton programme')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ouvrir la séance' }).filter({ visible: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('profile saved before the motivations existed: still opens, nothing invented', async ({ page }) => {
  const errors = collectErrors(page);
  // Old shape: life status and priorities set, no reasons.
  await seedProfile(page, { ...SCENARIOS.beginner, motivation: { why: 'être fier de moi' } });
  await page.goto('/');
  await expect(page).not.toHaveURL(/onboarding/);
  await page.goto('/settings/motivation');
  await expect(page.getByRole('checkbox', { name: /^Améliorer ma santé/ })).toHaveAttribute('aria-checked', 'false');
  await expect(field(page, 'Avec tes mots')).toHaveValue('être fier de moi');
  expect(errors).toEqual([]);
});

test('photo analysis unavailable (no service): says so, the meal is composed by hand and added once', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await seedProfile(page, SCENARIOS.beginner);
  await page.goto('/meal-analysis');
  await expect(text(page, 'Analyse photo indisponible en mode local')).toBeVisible();
  await button(page, 'Composer mon repas à la main').click();
  await button(page, 'Ajouter un aliment').click();
  await field(page, 'Rechercher un aliment').fill('banane');
  await page
    .getByRole('button', { name: /^Banane/ })
    .first()
    .click();
  // A food added by hand has no portion: it cannot be saved before the user gives one.
  await expect(button(page, 'Confirmer et ajouter')).toBeDisabled();
  await field(page, 'Portion (g)').fill('120');
  const confirm = button(page, 'Confirmer et ajouter');
  await expect(confirm).toBeEnabled();
  await confirm.dblclick();
  await expect(page).not.toHaveURL(/meal-analysis/);
  const meals = await page.evaluate(() => JSON.parse(localStorage.getItem('py.data.v1')!).state.loggedMeals);
  expect(meals).toHaveLength(1);
  expect(meals[0].items).toEqual([{ foodId: 'banana', grams: 120 }]);
  expect(errors).toEqual([]);
});
