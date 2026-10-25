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

  // The main button's label says what it does ("Continuer", "Aucune allergie"…): one stable handle.
  const next = () => page.getByTestId('onboarding-next').click();
  const pick = (name: string | RegExp) =>
    page
      .getByRole('radio', { name, exact: typeof name === 'string' })
      .or(page.getByRole('checkbox', { name, exact: typeof name === 'string' }))
      .first()
      .click();
  const title = (text: string) => expect(page.getByRole('heading', { name: text })).toBeVisible();

  await page.getByLabel('Prénom ou pseudo').fill('Camille');
  await next();
  await page.getByLabel('Année de naissance').fill('2000');
  await next();
  await page.getByLabel('Taille (cm)').fill('170');
  await page.getByLabel('Poids (kg)').fill('80');
  await next();
  // Sex is a sensitive answer: chosen, then confirmed (no automatic move).
  await pick('Femme');
  await next();
  // One-answer questions move on by themselves after the touch.
  await pick(/^Légère/);
  await title('Quel est ton objectif principal ?');
  await pick(/^Perte de gras/);
  await title('As-tu un poids cible ?');
  await page.getByLabel('Poids souhaité (kg)').fill('65');
  await pick('Dans 3 mois');
  await expect(page.getByText(/Échéance :/)).toBeVisible();
  await next();
  // Motivations: as many as true, never auto-advanced.
  await title('Qu’est-ce qui te motive ?');
  await pick(/^Perdre du poids/);
  await pick(/^Avoir plus d’énergie/);
  await expect(page.getByRole('checkbox', { name: /^Perdre du poids/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('checkbox', { name: /^Avoir plus d’énergie/ })).toHaveAttribute('aria-checked', 'true');
  await next();
  await title('Ton budget courses par semaine');
  await page.getByLabel('Autre montant par semaine (€)').fill('30');
  await next();
  await pick('Plaques');
  await next();
  await pick(/^Vegan/);
  await title('Allergies');
  await next();
  await next();
  await pick('3');
  await pick('30 min');
  await next();
  await pick(/^Non/);
  await title('Ton matériel à la maison');
  await next();
  await pick(/^Débutant/);
  await title('Combien de séances par semaine ?');
  await pick('3');
  await pick('45 min');
  await next();
  await next();
  await title('Ton plan de départ');

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
  // A row that opens a screen is a link (W-10 grouped list).
  await page.getByRole('link', { name: 'Ce que j’ai chez moi' }).filter({ visible: true }).first().click();
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
  // The measure entry is folded once something is measured, open on a first visit.
  const entry = button(page, 'Noter une mesure');
  await expect(entry).toBeVisible();
  if ((await entry.getAttribute('aria-expanded')) !== 'true') await entry.click();
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
    ['Nutrition', 'Repas du jour'],
    ['Progrès', 'Voir le bilan de la semaine'],
    ['Profil', 'Mon profil'],
    ['Aujourd’hui', 'J’ai 15 minutes'],
  ]) {
    await openTab(page, tab);
    await expect(text(page, heading)).toBeVisible();
  }
});
