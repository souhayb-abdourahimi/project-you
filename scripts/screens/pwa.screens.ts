import { test, type Page } from '@playwright/test';

import { seedProfile } from '../../e2e/helpers';
import { SCENARIOS } from '../../src/domain/scenarios';

/**
 * D-047 installable web app: the main screens at iPhone sizes, the web-only states (no health
 * store, no notifications, no calendar), the location answers and the offline reopen.
 * Chromium emulation only: Safari and the home-screen mode are checked on a real iPhone.
 */
const WEDNESDAY = new Date(2026, 8, 30, 10, 0);

async function shot(page: Page, name: string) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `screens/${test.info().project.name}/pwa-${name}.png` });
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(WEDNESDAY);
  await seedProfile(page, SCENARIOS.beginner);
});

test('main screens', async ({ page }) => {
  for (const [path, name] of [
    ['/', 'today'],
    ['/nutrition', 'nutrition'],
    ['/progress', 'progress'],
    ['/program', 'program'],
    ['/meal-analysis', 'meal'],
    ['/settings', 'settings'],
    ['/health', 'health-web'],
    ['/notifications', 'notifications-web'],
    ['/calendar', 'calendar-web'],
    ['/privacy', 'privacy'],
  ] as const) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await shot(page, name);
  }
});

test('places: location refused, then OpenStreetMap unreachable', async ({ page, context }) => {
  // Headless Chromium cannot answer the permission prompt: the refusal is the browser's own answer.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('deny') === null) return;
    navigator.geolocation.getCurrentPosition = (_ok, fail) =>
      fail?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
  });
  await page.goto('/places');
  await page.evaluate(() => sessionStorage.setItem('deny', '1'));
  await page.reload();
  await page.getByRole('button', { name: /Chercher autour de moi|Search around me/ }).click();
  await shot(page, 'places-denied');
  await page.evaluate(() => sessionStorage.removeItem('deny'));
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 48.8566, longitude: 2.3522 });
  await page.reload();
  await page.getByRole('button', { name: /Chercher autour de moi|Search around me/ }).click();
  await page.waitForTimeout(4000);
  await shot(page, 'places-network');
});

test('offline reopen', async ({ browser }) => {
  const project = test.info().project.use;
  const context = await browser.newContext({ ...project, serviceWorkers: 'allow' });
  const page = await context.newPage();
  await page.clock.setFixedTime(WEDNESDAY);
  await seedProfile(page, SCENARIOS.beginner);
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(2000);
  await context.setOffline(true);
  await page.reload();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `screens/${test.info().project.name}/pwa-offline.png` });
  await context.close();
});
