import { expect, test, type Page } from '@playwright/test';

import { SCENARIOS } from '../src/domain/scenarios';
import { mockAccount, type MockState } from './account/supabase-mock';
import { button, collectErrors, freezeClock, seedProfile, text } from './helpers';

/**
 * Critical screens, run in Chromium (mobile, desktop) and in WebKit with the iPhone 15 profile
 * (project `iphone-webkit`, CI). WebKit on Linux is the engine of Safari, not Safari on iOS: no
 * home-screen mode, no iOS keyboard, no real camera or GPS, other fonts. It catches engine bugs
 * (icons, layout, service worker, file field, geolocation API); the real iPhone stays a manual
 * check (docs/RELEASE_CHECKLIST.md § 6 bis).
 */
const SCREENS = [
  '/',
  '/program',
  '/nutrition',
  '/progress',
  '/profile',
  '/settings',
  '/calendar',
  '/health',
  '/places',
  '/meal-analysis',
  '/privacy',
  '/notifications',
  '/shopping',
  '/history',
];

/** Private-use glyphs (icon fonts), the replacement character and the white square "□". */
const MISSING_GLYPH = /[-�□]/;

async function audit(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    };
    const icons = [...document.querySelectorAll('[data-testid^="icon-"]')].filter(visible);
    const brokenIcons = icons
      .filter((el) => {
        const svg = el.tagName.toLowerCase() === 'svg' ? el : el.querySelector('svg');
        if (!svg) return true;
        const r = svg.getBoundingClientRect();
        // A drawing with a size, and no character standing in for it.
        return r.width < 4 || r.height < 4 || (el.textContent ?? '').trim().length > 0;
      })
      .map((el) => el.getAttribute('data-testid'));
    // Text pushed past the screen edge, outside any horizontal scroller (a carousel may scroll).
    const inScroller = (el: Element) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if ((o === 'auto' || o === 'scroll') && p.scrollWidth > p.clientWidth) return true;
      }
      return false;
    };
    const cut = [...document.querySelectorAll('body *')]
      .filter((el) => el.children.length === 0 && (el.textContent ?? '').trim() && visible(el))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return (r.right > vw + 1 || r.left < -1) && !inScroller(el);
      })
      .map((el) => (el.textContent ?? '').trim().slice(0, 40));
    return {
      text: document.body.innerText,
      icons: icons.length,
      brokenIcons,
      cut,
      overflow: document.documentElement.scrollWidth - vw,
    };
  });
}

test.describe('every critical screen draws its icons and fits the screen', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${scheme} mode`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.emulateMedia({ colorScheme: scheme });
      const errors = collectErrors(page);
      await freezeClock(page);
      await seedProfile(page, SCENARIOS.beginner);
      let icons = 0;
      for (const path of SCREENS) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        const result = await audit(page);
        expect(result.text, `${path}: a missing glyph`).not.toMatch(MISSING_GLYPH);
        expect(result.brokenIcons, `${path}: icons without a drawing`).toEqual([]);
        expect(result.overflow, `${path}: sideways scroll`).toBeLessThanOrEqual(0);
        expect(result.cut, `${path}: text past the screen edge`).toEqual([]);
        icons += result.icons;
      }
      expect(icons).toBeGreaterThan(30);
      if (scheme === 'dark') {
        const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        expect(background).toBe('rgb(11, 13, 18)');
      }
      expect(errors).toEqual([]);
    });
  }
});

test.describe('simulated position', () => {
  test.use({ geolocation: { latitude: 48.85661, longitude: 2.35222 }, permissions: ['geolocation'] });

  test('nearby gyms from a simulated position, the exact position never sent', async ({ page }) => {
    let sent = '';
    await page.route('**/api/interpreter', async (route) => {
      sent = decodeURIComponent(route.request().postData() ?? '');
      await route.fulfill({
        json: {
          elements: [
            {
              type: 'node',
              id: 1,
              lat: 48.858,
              lon: 2.355,
              tags: { leisure: 'fitness_centre', name: 'Salle Rivoli (fixture)' },
            },
          ],
        },
      });
    });
    await seedProfile(page, SCENARIOS.noGym);
    await page.goto('/places');
    await button(page, 'Chercher autour de moi').click();
    await expect(text(page, 'Salle Rivoli (fixture)')).toBeVisible();
    expect(sent).toContain('48.857,2.352');
    expect(sent).not.toContain('48.85661');
  });
});

test.describe('meal photo (signed in, fake project)', () => {
  // A 1×1 PNG: the app resizes and re-encodes it to JPEG before sending.
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const ACCOUNT = 'http://localhost:8766';

  async function pick(page: Page, state: MockState) {
    await mockAccount(page, state);
    await seedProfile(page, SCENARIOS.beginner);
    await page.goto(`${ACCOUNT}/meal-analysis`);
    const chooser = page.waitForEvent('filechooser');
    await button(page, /^Choisir (dans la galerie|une photo)$/).click();
    const fileChooser = await chooser;
    expect(await fileChooser.element().getAttribute('accept')).toContain('image/*');
    await fileChooser.setFiles({ name: 'repas.png', mimeType: 'image/png', buffer: PNG });
    await button(page, 'Analyser').click();
  }

  test('vision names the foods, Ciqual computes the values', async ({ page }) => {
    const state: MockState = {
      feed: null,
      calls: [],
      busy: [],
      analysis: {
        status: 200,
        body: { items: [{ label: 'Saumon', foodId: 'salmon', grams: 120, confidence: 0.7 }], model: 'vision-x' },
      },
    };
    await pick(page, state);
    await expect(text(page, /Saumon .*120 g/)).toBeVisible();
    await expect(text(page, /table Ciqual/)).toBeVisible();
    // A JPEG, re-encoded on the device; nothing else about the user is sent.
    expect(state.analyses).toHaveLength(1);
    const sent = state.analyses?.[0] as { image: string; mediaType: string };
    expect(sent.mediaType).toBe('image/jpeg');
    expect(sent.image.startsWith('/9j/')).toBe(true);
  });

  test('every provider failed: the precise reason, and manual composition offered', async ({ page }) => {
    const state: MockState = {
      feed: null,
      calls: [],
      busy: [],
      analysis: { status: 502, body: { error: 'analysis_failed', reason: 'quota', tried: 2 } },
    };
    await pick(page, state);
    await expect(text(page, /quota|crédit/i)).toBeVisible();
    await expect(button(page, 'Composer mon repas à la main')).toBeVisible();
  });
});
