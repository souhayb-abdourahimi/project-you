import { expect, test, type Page } from '@playwright/test';

import { SCENARIOS } from '../src/domain/scenarios';
import { button, collectErrors, field, freezeClock, openTab, seedData, seedProfile, text } from './helpers';

/**
 * W-8 (D-043): every answer can be changed in Réglages, the change is previewed and confirmed when
 * it is structural, the past is never rewritten, and display settings never change a stored value.
 */

interface Stored {
  programs?: { version: number; status: string; params: { sessionsPerWeek: number } | null }[];
  completedSessions?: { date: string }[];
  weights?: { id: string; date: string; weightKg: number }[];
}
const stored = (page: Page) =>
  page.evaluate(() => (JSON.parse(localStorage.getItem('py.data.v1') ?? '{}').state ?? {}) as Stored);
const profile = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('py.profile.v1') ?? '{}').state?.snapshot);
const reminders = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('py.notifications.v1') ?? '{}').state);

const done = { date: '2026-09-28', sessionIndex: 0, variant: 'full', completedAt: '2026-09-28T18:00:00.000Z' };
const weights = [
  { id: 'aaaaaaaa-0000-4000-8000-000000000101', date: '2026-09-21', weightKg: 80 },
  { id: 'aaaaaaaa-0000-4000-8000-000000000102', date: '2026-09-28', weightKg: 8 },
];

test.beforeEach(async ({ page }) => {
  await freezeClock(page);
  await seedProfile(page, SCENARIOS.muscleGain);
});

test('training: a new frequency is previewed, confirmed, and becomes a new version; the past stays', async ({ page }) => {
  const errors = collectErrors(page);
  await seedData(page, { completedSessions: [done] });
  await page.goto('/');
  await openTab(page, 'Programme');
  await expect.poll(async () => (await stored(page)).programs?.length).toBe(1);

  await page.goto('/settings');
  await page.getByRole('link', { name: /^Entraînement/ }).click();
  await expect(page).toHaveURL(/settings\/training/);
  await expect(button(page, 'Enregistrer')).toBeDisabled();
  await page.getByRole('checkbox', { name: '4', exact: true }).filter({ visible: true }).first().click();
  await expect(text(page, 'Ce qui va changer')).toBeVisible();
  await expect(text(page, /Nouvelle version de ton programme à partir d’aujourd’hui/)).toBeVisible();
  await button(page, 'Enregistrer').click();
  // Structural: nothing is saved before the confirmation.
  expect((await profile(page)).training.sessionsPerWeek).toBe(3);
  await button(page, 'Confirmer et enregistrer').click();
  await expect(text(page, 'Enregistré.')).toBeVisible();
  expect((await profile(page)).training.sessionsPerWeek).toBe(4);

  await page.goto('/');
  await openTab(page, 'Programme');
  await expect
    .poll(async () => (await stored(page)).programs?.map((p) => [p.version, p.params?.sessionsPerWeek]))
    .toEqual([
      [1, 3],
      [2, 4],
    ]);
  expect((await stored(page)).completedSessions).toEqual([done]);
  expect(errors).toEqual([]);
});

test('an incomplete form cannot be saved and says what is missing', async ({ page }) => {
  await page.goto('/settings/profile');
  await field(page, 'Prénom').fill('');
  await expect(text(page, /À compléter avant d’enregistrer/)).toBeVisible();
  await expect(button(page, 'Enregistrer')).toBeDisabled();
  await button(page, 'Annuler mes changements').click();
  await expect(field(page, 'Prénom')).toHaveValue(SCENARIOS.muscleGain.user.displayName);
});

test('pounds: weights and loads shown in lb, every stored value stays in kg', async ({ page }) => {
  const errors = collectErrors(page);
  await seedData(page, { weights: [weights[0]] });
  await page.goto('/settings');
  await page.getByRole('radio', { name: 'Livres (lb)' }).filter({ visible: true }).first().click();
  await expect.poll(async () => (await profile(page)).preferences.weightUnit).toBe('lb');
  await page.goto('/');
  await openTab(page, 'Progrès');
  await expect(text(page, /176,4\s?lb/)).toBeVisible();
  expect((await stored(page)).weights).toEqual([weights[0]]);
  expect(errors).toEqual([]);
});

test('reminders: categories and quiet hours are real choices, saved for the account', async ({ page }) => {
  await page.goto('/notifications');
  // Web: scheduled reminders are a mobile feature, the screen says so instead of a dead switch.
  await expect(text(page, /disponibles dans l’app mobile/)).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Notifications activées' }).first()).toBeDisabled();
  await expect(page.getByRole('switch', { name: 'Calendrier' })).toHaveCount(0);

  await page.getByRole('switch', { name: 'Bilan de la semaine', checked: true }).first().click();
  await expect.poll(async () => (await reminders(page)).prefs.categories.checkin).toBe(false);
  expect((await reminders(page)).prefsSaved).toBe(true);

  await page.getByRole('switch', { name: 'Heures silencieuses activées' }).first().click();
  await expect(field(page, 'Début (HH:MM)')).toHaveCount(0);
  await expect.poll(async () => (await reminders(page)).prefs.quietEnabled).toBe(false);
  await page.getByRole('switch', { name: 'Heures silencieuses activées' }).first().click();
  await field(page, 'Début (HH:MM)').fill('23:3');
  await expect(text(page, 'Format attendu : HH:MM')).toBeVisible();
  await field(page, 'Début (HH:MM)').fill('23:30');
  await expect.poll(async () => (await reminders(page)).prefs.quietStart).toBe('23:30');
});

test('a mistaken weigh-in is corrected, then another is deleted after a confirmation', async ({ page }) => {
  const errors = collectErrors(page);
  await seedData(page, { weights });
  await page.goto('/measurements');
  await button(page, /^Corriger : Pesée, .*28/).click();
  await field(page, 'Nouvelle valeur (kg)').fill('3');
  await expect(text(page, 'Valeur hors des limites possibles.')).toBeVisible();
  await expect(button(page, 'Enregistrer la correction')).toBeDisabled();
  await field(page, 'Nouvelle valeur (kg)').fill('80,4');
  await button(page, 'Enregistrer la correction').click();
  await expect.poll(async () => (await stored(page)).weights?.map((w) => w.weightKg)).toEqual([80, 80.4]);

  await button(page, /^Supprimer : Pesée, .*21/).click();
  expect((await stored(page)).weights).toHaveLength(2);
  await button(page, 'Oui, supprimer').click();
  await expect.poll(async () => (await stored(page)).weights?.map((w) => w.date)).toEqual(['2026-09-28']);
  expect(errors).toEqual([]);
});

test('leaving a form with unsaved changes asks first', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('link', { name: /^Motivation/ }).click();
  await field(page, /Ton pourquoi|Pourquoi/).first().fill('Pour courir avec mes enfants');
  let asked = '';
  page.once('dialog', (d) => {
    asked = d.message();
    void d.dismiss();
  });
  await page.goBack();
  await expect.poll(() => asked).toMatch(/pas enregistrés/);
});
