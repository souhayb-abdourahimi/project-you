import { expect, test } from '@playwright/test';

import { SCENARIOS } from '../src/domain/scenarios';

import { button, collectErrors, seedProfile, text } from './helpers';

/**
 * Installable web app (D-047): manifest, iPhone meta tags, app-shell service worker. Chromium only
 * here; Safari on a real iPhone is a manual check (docs/WEB_PWA.md).
 */
test.use({ serviceWorkers: 'allow' });

test('manifest and icons: installable as PROJECT YOU, standalone, portrait', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    name: 'PROJECT YOU',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'fr',
  });
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512', '180x180']),
  );
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons) {
    const file = await request.get(icon.src);
    expect(file.ok(), icon.src).toBe(true);
    expect(file.headers()['content-type']).toBe('image/png');
  }
});

test('iPhone tags: safe areas, home-screen mode, icon, French, zoom never locked', async ({ page }) => {
  await page.goto('/');
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewport).toContain('viewport-fit=cover');
  expect(viewport).not.toMatch(/user-scalable=no|maximum-scale/);
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'PROJECT YOU');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/icons/apple-touch-icon.png');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
});

test('dark mode: browser bars and page background follow the theme (no white edges)', async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: 'dark', serviceWorkers: 'block', locale: 'fr-FR' });
  const page = await context.newPage();
  await seedProfile(page, SCENARIOS.beginner);
  await page.goto('/');
  await expect(text(page, 'Aujourd’hui')).toBeVisible();
  const colors = await page.evaluate(() => ({
    meta: [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute('content')),
    body: getComputedStyle(document.body).backgroundColor,
  }));
  expect(new Set(colors.meta)).toEqual(new Set(['#0B0D12']));
  expect(colors.body).toBe('rgb(11, 13, 18)');
  await context.close();
});

test('offline: the installed app still opens, and only app files are cached', async ({ page, context }) => {
  const errors = collectErrors(page);
  await seedProfile(page, SCENARIOS.beginner);
  await page.goto('/');
  await expect(text(page, 'Aujourd’hui')).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  // The bundle is kept once the worker took over. Icons are drawings inside it (D-048): no icon
  // font is ever downloaded, so none can be served stale or missing after an update.
  await expect
    .poll(async () => {
      const urls = await page.evaluate(async () => {
        const all: string[] = [];
        for (const name of await caches.keys()) for (const r of await (await caches.open(name)).keys()) all.push(r.url);
        return all;
      });
      return !urls.some((u) => u.endsWith('.ttf')) && urls.some((u) => u.includes('/_expo/static/js/'));
    })
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(text(page, 'Aujourd’hui')).toBeVisible();

  const cached = await page.evaluate(async () => {
    const all: string[] = [];
    for (const name of await caches.keys()) for (const r of await (await caches.open(name)).keys()) all.push(r.url);
    return all;
  });
  const origin = new URL(page.url()).origin;
  // Never another origin (Supabase, OpenStreetMap, analysis service), never an API answer.
  expect(cached.every((u) => u.startsWith(origin))).toBe(true);
  expect(
    cached.every((u) =>
      /\/($|_expo\/static\/|assets\/|icons\/|favicon\.ico$|manifest\.webmanifest$)/.test(new URL(u).pathname),
    ),
  ).toBe(true);
  await context.setOffline(false);
  expect(errors).toEqual([]);
});

test('a phone-sized screen never scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await seedProfile(page, SCENARIOS.beginner);
  for (const path of ['/', '/nutrition', '/progress', '/program', '/places', '/meal-analysis', '/settings']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test('a page opened without history (reload, reopened app) still has a way back', async ({ page }) => {
  await seedProfile(page, SCENARIOS.beginner);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Retour à Aujourd’hui' }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/$/);
  await expect(text(page, 'Aujourd’hui')).toBeVisible();
});

test('a new build is offered with a discreet banner, applied only when the user asks', async ({ page, context }) => {
  const errors = collectErrors(page);
  await seedProfile(page, SCENARIOS.beginner);
  await page.goto('/');
  await expect(text(page, 'Aujourd’hui')).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const first = await page.evaluate(async () => (await caches.keys()).find((k) => k.startsWith('py-shell-')));
  expect(first).toMatch(/^py-shell-v3-[0-9a-f]{12}$/); // stamped at export

  // A new deploy: the same worker with another build stamp (served to this test context only).
  await context.addCookies([{ name: 'py-e2e-sw-build', value: 'nextbuild001', url: page.url() }]);
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
  await expect(text(page, 'Nouvelle version disponible')).toBeVisible();
  // Nothing switched yet: the running version keeps control until the user chooses.
  expect(await page.evaluate(async () => (await caches.keys()).includes('py-shell-v3-nextbuild001'))).toBe(true);
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  const reloaded = page.waitForEvent('load');
  await button(page, 'Mettre à jour').click();
  await reloaded;
  await expect(text(page, 'Aujourd’hui')).toBeVisible();
  await expect(text(page, 'Nouvelle version disponible')).toHaveCount(0);
  // The old caches are gone with the old version.
  await expect
    .poll(() => page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('py-shell-'))))
    .toEqual(['py-shell-v3-nextbuild001']);
  expect(errors).toEqual([]);
});
