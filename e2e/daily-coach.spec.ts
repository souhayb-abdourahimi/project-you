import { expect, test, type Page } from '@playwright/test';

import { SCENARIOS } from '../src/domain/scenarios';
import { button, collectErrors, freezeClock, history, openTab, seedData, seedProfile, text } from './helpers';

/**
 * Daily Coach and Progress Journey (D-028): the day as the user lives it, from a recorded
 * history (MOCK data). The clock is frozen on Wednesday 30 September 2026, 10:00.
 */

/** The coach card is labelled "Motivation"; it is hidden while the safety rule is active. */
const coachCard = (page: Page) => page.getByText('Motivation', { exact: true }).filter({ visible: true });

test('first day: a welcome, one action, and an empty story that says so', async ({ page }) => {
  const errors = collectErrors(page);
  await freezeClock(page);
  await seedProfile(page, SCENARIOS.beginner);
  await page.goto('/');
  await expect(text(page, 'Bienvenue Alex (MOCK) 👋')).toBeVisible();
  await expect(text(page, 'Ton parcours commence aujourd’hui')).toBeVisible();
  await expect(text(page, 'Ta prochaine action')).toBeVisible();
  await expect(text(page, 'Ta journée')).toBeVisible();

  await openTab(page, 'Progression');
  await expect(text(page, 'Ton histoire commence aujourd’hui')).toBeVisible();
  await expect(button(page, 'Voir ma journée')).toBeVisible();
  expect(errors).toEqual([]);
});

test('normal day: real counts, the next action and why it is there', async ({ page }) => {
  const errors = collectErrors(page);
  await freezeClock(page);
  await seedProfile(page, SCENARIOS.beginner);
  await seedData(page, history({ from: '2026-08-03', to: '2026-09-29' }));
  await page.goto('/');
  await expect(text(page, 'Bonjour Alex (MOCK)')).toBeVisible();
  // The headline only uses recorded facts (17 sessions done, 9 weeks in a row, 33 active days).
  await expect(
    text(page, /17 séance\(s\) faite\(s\) depuis le début|9 semaines d’affilée|33 jours actifs/),
  ).toBeVisible();
  await expect(coachCard(page)).toBeVisible();
  await button(page, 'Pourquoi ?').click();
  await expect(text(page, /Basé sur/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('difficult day: a minimal version in one tap, and back to normal', async ({ page }) => {
  await freezeClock(page);
  await seedProfile(page, SCENARIOS.beginner);
  await seedData(page, history({ from: '2026-08-03', to: '2026-09-29' }));
  await page.goto('/');
  await button(page, 'Journée difficile').click();
  await expect(text(page, 'Journée difficile : on garde une version minimale.')).toBeVisible();
  // D-034: the full session's length is the stored prescription's (35 min, the one the session runs).
  await expect(text(page, /Séance ramenée de 35 à 20|mobilité douce|marche courte|repos aujourd’hui/)).toBeVisible();
  await button(page, 'Revenir à ma journée normale').click();
  await expect(text(page, 'Journée difficile : on garde une version minimale.')).toBeHidden();
});

test('after ten days away: welcome back, a short restart, nothing to catch up', async ({ page }) => {
  await freezeClock(page);
  await seedProfile(page, SCENARIOS.beginner);
  await seedData(page, history({ from: '2026-08-03', to: '2026-09-20' }));
  await page.goto('/');
  await expect(text(page, 'Content de te revoir 👋')).toBeVisible();
  await expect(text(page, 'On reprend à partir d’aujourd’hui.')).toBeVisible();
  await expect(text(page, 'Pour reprendre : une séance courte de 15 minutes.')).toBeVisible();
  await expect(text(page, /rattrap/)).toBeHidden();
});

test('Mon évolution: since the start, measured body changes, loads that progress, the path', async ({ page }) => {
  const errors = collectErrors(page);
  await freezeClock(page);
  await seedProfile(page, SCENARIOS.beginner);
  await seedData(page, history({ from: '2026-08-03', to: '2026-09-29' }));
  await page.goto('/progress');
  await expect(text(page, 'Mon évolution')).toBeVisible();
  await expect(text(page, 'Ton projet a commencé il y a 58 jour(s).')).toBeVisible();
  await expect(text(page, '33 jour(s) actif(s) · 17 séance(s) faite(s)')).toBeVisible();
  await expect(text(page, 'Goblet squat : 18 kg × 8 → 32 kg × 8')).toBeVisible();
  await expect(text(page, /−?-?2\.2 kg depuis ta première semaine de pesées/)).toBeVisible();
  await expect(text(page, /-4 cm depuis ta première mesure/)).toBeVisible();
  await expect(text(page, 'Étape 2 · 10 séances faites')).toBeVisible();
  await expect(text(page, 'Ton plan cette semaine')).toBeVisible();
  // Rule 7: nothing the app cannot measure.
  await expect(text(page, /muscle gagné|graisse perdue|calories brûlées/i)).toBeHidden();
  expect(errors).toEqual([]);
});

test('recomposition: the waist comes before the scale', async ({ page }) => {
  await freezeClock(page);
  await seedProfile(page, SCENARIOS.recomposition);
  await seedData(page, history({ from: '2026-08-03', to: '2026-09-29', kgPerWeek: 0 }));
  await page.goto('/progress');
  const waist = page.getByText('Tour de taille', { exact: true }).filter({ visible: true }).first();
  const weight = page
    .getByText(/^Poids \(moyenne/)
    .filter({ visible: true })
    .first();
  const [w, p] = [await waist.boundingBox(), await weight.boundingBox()];
  expect(w!.y).toBeLessThan(p!.y);
  await expect(text(page, /Ton poids bouge peu, c’est attendu en recomposition/)).toBeVisible();
});

test('a milestone is celebrated once, on Today', async ({ page }) => {
  await freezeClock(page);
  await seedProfile(page, SCENARIOS.beginner);
  // Tenth session on Monday 28 September.
  await seedData(page, history({ from: '2026-08-27', to: '2026-09-29' }));
  await page.goto('/');
  await expect(button(page, 'Merci !')).toBeVisible();
  await button(page, 'Merci !').click();
  await expect(button(page, 'Merci !')).toBeHidden();
  await page.reload();
  await expect(text(page, /Bonjour Alex/)).toBeVisible();
  await expect(button(page, 'Merci !')).toBeHidden();
});

test('weekly check-in: answers in under a minute, then the review says what it is based on', async ({ page }) => {
  // Friday 2 October: the check-in window is open.
  await page.clock.setFixedTime(new Date(2026, 9, 2, 10, 0));
  await seedProfile(page, SCENARIOS.beginner);
  await seedData(page, history({ from: '2026-08-03', to: '2026-10-01' }));
  await page.goto('/review');
  await button(page, 'Répondre au check-in de la semaine').click();
  await expect(text(page, 'Comment s’est passée ta semaine ?')).toBeVisible();
  await page.getByRole('checkbox', { name: '4', exact: true }).filter({ visible: true }).first().click();
  await button(page, 'Voir mon bilan').click();
  await expect(text(page, 'Check-in de la semaine : merci, tes réponses sont prises en compte.')).toBeVisible();
  await expect(text(page, 'Ce qui a fonctionné')).toBeVisible();
});

test('safety rule active: the notice first, no congratulation, no motivation push', async ({ page }) => {
  const errors = collectErrors(page);
  await freezeClock(page);
  await seedProfile(page, SCENARIOS.beginner);
  // About 2 % of body weight lost per week for three weeks, ten sessions done (milestone).
  await seedData(page, history({ from: '2026-08-27', to: '2026-09-29', kgPerWeek: -1.6 }));
  await page.goto('/');
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: /rythme|ralenti/i })
      .first(),
  ).toBeVisible();
  await expect(coachCard(page)).toBeHidden();
  await expect(button(page, 'Merci !')).toBeHidden();
  expect(errors).toEqual([]);
});

test('no motivation: a walk instead of the session counts as adapted, not missed', async ({ page }) => {
  await freezeClock(page);
  await seedProfile(page, SCENARIOS.beginner);
  await seedData(page, history({ from: '2026-08-03', to: '2026-09-29' }));
  await page.goto('/');
  await button(page, 'Je n’ai pas envie').click();
  await button(page, 'Marche de 20 minutes').click();
  await expect(text(page, 'C’est noté : bouger un peu compte vraiment.')).toBeVisible();
  await page.goBack();
  await expect(text(page, /Marche faite/)).toBeVisible();
});
