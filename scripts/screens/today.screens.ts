import { test, type Page } from '@playwright/test';

import { history, openTab, seedData, seedProfile } from '../../e2e/helpers';
import { SCENARIOS } from '../../src/domain/scenarios';

/**
 * The states of Today and the navigation, from the same MOCK scenarios as the E2E tests (the clock
 * is frozen on Wednesday 30 September 2026, 10:00, a training day for the sample profiles).
 */
const WEDNESDAY = new Date(2026, 8, 30, 10, 0);
const TUESDAY = new Date(2026, 8, 29, 10, 0);

/** The screen scrolls inside the app, so a "full" capture grows the viewport to the content. */
async function shot(page: Page, name: string, full = true) {
  const size = page.viewportSize()!;
  if (full) await page.setViewportSize({ width: size.width, height: 3000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `screens/${test.info().project.name}/${name}.png` });
  if (full) await page.setViewportSize(size);
}

test('today: training day with a history', async ({ page }) => {
  await page.clock.setFixedTime(WEDNESDAY);
  await seedProfile(page, SCENARIOS.beginner);
  await seedData(page, history({ from: '2026-08-03', to: '2026-09-29' }));
  await page.goto('/');
  await page.getByText('Ta prochaine action').first().waitFor();
  await shot(page, 'today-training', false);
  await shot(page, 'today-training-full');
});

test('today: first day', async ({ page }) => {
  await page.clock.setFixedTime(WEDNESDAY);
  await seedProfile(page, SCENARIOS.beginner);
  await page.goto('/');
  await page.getByText('Ta prochaine action').first().waitFor();
  await shot(page, 'today-first-day');
});

test('today: rest day', async ({ page }) => {
  await page.clock.setFixedTime(TUESDAY);
  await seedProfile(page, SCENARIOS.beginner);
  await seedData(page, history({ from: '2026-08-03', to: '2026-09-28' }));
  await page.goto('/');
  await page.getByText('Ta prochaine action').first().waitFor();
  await shot(page, 'today-rest');
});

test('today: comeback after ten days', async ({ page }) => {
  await page.clock.setFixedTime(WEDNESDAY);
  await seedProfile(page, SCENARIOS.beginner);
  await seedData(page, history({ from: '2026-08-03', to: '2026-09-20' }));
  await page.goto('/');
  await page.getByText('Ta prochaine action').first().waitFor();
  await shot(page, 'today-comeback');
});

test('today: safety rule active', async ({ page }) => {
  await page.clock.setFixedTime(WEDNESDAY);
  await seedProfile(page, SCENARIOS.beginner);
  await seedData(page, history({ from: '2026-08-27', to: '2026-09-29', kgPerWeek: -1.6 }));
  await page.goto('/');
  await page.getByRole('alert').first().waitFor();
  await shot(page, 'today-safety');
});

test('today: difficult day', async ({ page }) => {
  await page.clock.setFixedTime(WEDNESDAY);
  await seedProfile(page, SCENARIOS.beginner);
  await seedData(page, history({ from: '2026-08-03', to: '2026-09-29' }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Journée difficile' }).filter({ visible: true }).first().click();
  await page.getByText('Journée difficile : on garde une version minimale.').first().waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'today-difficult');
});

test('profile tab', async ({ page }) => {
  await page.clock.setFixedTime(WEDNESDAY);
  await seedProfile(page, SCENARIOS.beginner);
  await page.goto('/');
  await openTab(page, 'Profil');
  await page.getByText('Mon profil').first().waitFor();
  await shot(page, 'profile');
});
