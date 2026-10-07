import { test, type Page } from '@playwright/test';

import { history, openTab, seedData, seedProfile } from '../../e2e/helpers';
import { SCENARIOS } from '../../src/domain/scenarios';

/**
 * The other screens of W-9 (passes 4 → 10), from the same MOCK scenarios as the E2E tests, on
 * Wednesday 30 September 2026, 10:00 (a training day), with eight weeks of MOCK history.
 */
const WEDNESDAY = new Date(2026, 8, 30, 10, 0);
const FRIDAY = new Date(2026, 9, 2, 10, 0);

async function shot(page: Page, name: string, full = true) {
  const size = page.viewportSize()!;
  if (full) await page.setViewportSize({ width: size.width, height: 3000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `screens/${test.info().project.name}/${name}.png` });
  if (full) await page.setViewportSize(size);
}

async function start(page: Page, when = WEDNESDAY, to = '2026-09-29') {
  await page.clock.setFixedTime(when);
  await seedProfile(page, SCENARIOS.beginner);
  await seedData(page, history({ from: '2026-08-03', to }));
}

test('workout: a set to log, then the rest', async ({ page }) => {
  await start(page);
  await page.goto('/workout/2026-09-30');
  await page.getByRole('button', { name: 'Valider la série' }).filter({ visible: true }).first().waitFor();
  await shot(page, 'workout', false);
  await shot(page, 'workout-full');
  const field = (label: string) => page.getByLabel(label, { exact: true }).filter({ visible: true }).first();
  for (const [label, value] of [
    ['Charge (kg)', '40'],
    ['Répétitions', '8'],
  ]) {
    const input = page.getByLabel(label, { exact: true }).filter({ visible: true });
    if ((await input.count()) > 0 && (await field(label).inputValue()) === '') await field(label).fill(value);
  }
  await page.getByRole('button', { name: 'Valider la série' }).filter({ visible: true }).first().click();
  await page.getByText('Repos').first().waitFor();
  await shot(page, 'workout-rest', false);
  await page.getByRole('button', { name: 'Terminer la séance' }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: 'Terminer maintenant' }).filter({ visible: true }).first().click();
  await page.getByText('Comment était la séance ?').first().waitFor();
  await shot(page, 'workout-summary', false);
});

test('programme tab', async ({ page }) => {
  await start(page);
  await page.goto('/');
  await openTab(page, 'Programme');
  await page.getByText(/^Programme v1 · depuis le/).first().waitFor();
  await shot(page, 'program', false);
  await shot(page, 'program-full');
});

test('nutrition tab', async ({ page }) => {
  await start(page);
  await page.goto('/');
  await openTab(page, 'Nutrition');
  await page.getByRole('button', { name: 'Je l’ai mangé' }).first().waitFor();
  await page.getByRole('button', { name: 'Je l’ai mangé' }).first().click();
  await shot(page, 'nutrition', false);
  await shot(page, 'nutrition-full');
});

test('progress tab', async ({ page }) => {
  await start(page);
  await page.goto('/');
  await openTab(page, 'Progrès');
  await page.getByRole('button', { name: 'Voir l’historique' }).first().waitFor();
  await shot(page, 'progress', false);
  await shot(page, 'progress-full');
});

test('weekly review', async ({ page }) => {
  await start(page, FRIDAY, '2026-10-01');
  await page.goto('/review');
  await page.getByText('Ce qui a fonctionné').first().waitFor();
  await shot(page, 'review', false);
  await shot(page, 'review-full');
});

test('history', async ({ page }) => {
  await start(page);
  await page.goto('/history');
  await page.getByText('Cette semaine').first().waitFor();
  await shot(page, 'history', false);
  await shot(page, 'history-full');
});

test('settings and privacy', async ({ page }) => {
  await start(page);
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
  await shot(page, 'settings-full');
  await page.goto('/privacy');
  await page.waitForTimeout(1200);
  await shot(page, 'privacy-full');
});
