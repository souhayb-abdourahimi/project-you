import { expect, test } from '@playwright/test';

import { SCENARIOS } from '../src/domain/scenarios';

import { button, collectErrors, field, freezeClock, openTab, seedProfile, text } from './helpers';

test.beforeEach(async ({ page }) => {
  await freezeClock(page);
});

test('first visit: onboarding → today → meals → inventory → workout → progress → weekly review → privacy', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/');
  // With Supabase configured, the sign-in screen offers local mode; without it, onboarding starts directly.
  const local = page.getByRole('button', { name: 'Continuer sans compte (sur cet appareil)' });
  const name = page.getByLabel('Prénom ou pseudo');
  await expect(local.or(name).first()).toBeVisible();
  if (await local.isVisible()) await local.click();

  const next = () => button(page, 'Continuer').click();
  const pick = (name: string | RegExp) =>
    page
      .getByRole('checkbox', { name, exact: typeof name === 'string' })
      .first()
      .click();

  await page.getByLabel('Prénom ou pseudo').fill('Camille');
  await next();
  await page.getByLabel('Année de naissance').fill('2000');
  await next();
  await page.getByLabel('Taille (cm)').fill('170');
  await page.getByLabel('Poids (kg)').fill('80');
  await next();
  await pick('Femme');
  await next();
  await pick(/Légère/);
  await next();
  await pick('Perte de gras');
  await next();
  await page.getByLabel('Poids souhaité (kg)').fill('72');
  await page.getByLabel(/Pour quand/).fill('2026-12-01');
  await next();
  for (let i = 0; i < 3; i++) await next();
  await pick('Étudiant·e');
  await next();
  await page.getByLabel('Budget hebdomadaire (€)').fill('30');
  await next();
  await pick('Plaques');
  await next();
  await pick('Vegan');
  await next();
  await next();
  await next();
  await pick('3');
  await pick('30 min');
  await next();
  await pick('Non');
  await next();
  await next();
  await pick('Débutant');
  await next();
  await pick('3');
  await pick('45 min');
  await next();
  await next();
  await next();

  // Aggressive goal: flagged, estimate at month level, user keeps the choice.
  await expect(page.getByText(/estimation, pas une promesse/)).toBeVisible();
  await button(page, 'Créer mon programme').click();

  // First day: a welcome, not a progress report (Daily Coach, D-028).
  await expect(page.getByText('Bienvenue Camille 👋')).toBeVisible();
  await expect(page.getByText('Ton parcours commence aujourd’hui')).toBeVisible();

  // Nutrition: vegan plan with protein coverage, Ciqual source and no MOCK badge.
  await openTab(page, 'Nutrition');
  await expect(page.getByText(/Protéines prévues aujourd’hui/)).toBeVisible();
  await expect(page.getByText(/d’après la table Ciqual 2025 de l’ANSES/).filter({ visible: true })).toBeVisible();
  await expect(page.getByText('MOCK').filter({ visible: true })).toHaveCount(0);
  await expect(page.getByText(/Blanc de poulet|Thon|Saumon|Skyr/).filter({ visible: true })).toHaveCount(0);

  // Inventory.
  await button(page, 'Ce que j’ai chez moi').click();
  await expect(page.getByText(/inventaire est vide/)).toBeVisible();
  await page.goBack();

  // "J'ai 15 minutes" → short workout → log a set.
  await openTab(page, 'Aujourd’hui');
  await button(page, 'J’ai 15 minutes').click();
  await expect(page.getByText(/Peu de temps/)).toBeVisible();
  // W-3 (D-034): the duration announced is the one the short session is built for.
  await button(page, 'Séance courte (15 min)').click();
  await expect(page.getByRole('heading', { name: 'Full body B' })).toBeVisible();
  await expect(text(page, 'Version courte')).toBeVisible();
  await expect(text(page, 'Environ 15 min')).toBeVisible();
  await page.getByLabel('Répétitions').first().fill('10');
  await button(page, 'Valider la série').click();
  await button(page, 'Terminer la séance').click();
  await button(page, 'Terminer maintenant').click();
  await expect(text(page, 'Séance terminée')).toBeVisible();
  await button(page, 'Retour à aujourd’hui').click();
  await expect(page).not.toHaveURL(/workout/);

  // Progress: weigh-in, then weekly review.
  await page.goto('/progress');
  await field(page, 'Poids (kg)').fill('79.5');
  await button(page, 'Noter mon poids').click();
  await button(page, 'Voir le bilan de la semaine').click();
  await expect(text(page, 'Ce qui a fonctionné')).toBeVisible();
  await expect(text(page, /1 séance\(s\) en version courte/)).toBeVisible();

  // Privacy Center: counts and a confirmed deletion.
  await page.goto('/privacy');
  await expect(text(page, 'Mode local : rien n’est envoyé sur un serveur.')).toBeVisible();
  await button(page, 'Supprimer').first().click();
  await button(page, 'Confirmer').click();
  await expect(text(page, 'Données supprimées.')).toBeVisible();

  expect(errors).toEqual([]);
});

test('every tab is reachable from the navigation', async ({ page }) => {
  await seedProfile(page, SCENARIOS.beginner);
  await page.goto('/');
  for (const [tab, heading] of [
    ['Programme', 'Ton programme'],
    ['Nutrition', 'Tes repères du jour'],
    ['Progression', 'Voir le bilan de la semaine'],
    ['Aujourd’hui', 'J’ai 15 minutes'],
  ]) {
    await openTab(page, tab);
    await expect(text(page, heading)).toBeVisible();
  }
});
