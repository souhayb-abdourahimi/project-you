import { test, type Page } from '@playwright/test';

import { mockAccount, type MockState } from '../../e2e/account/supabase-mock';
import { seedProfile } from '../../e2e/helpers';
import { SCENARIOS } from '../../src/domain/scenarios';

/**
 * D-048 / D-049 captures, signed in against the fake project (export `dist-account`): the iCal
 * card in its states, the meal photo draft and the precise failure. Chromium emulation only.
 */
const ACCOUNT = 'http://localhost:8766';
const MONDAY = new Date('2026-09-28T07:00:00Z');
const EVENINGS = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'].map((d) => ({
  start: `${d}T15:00:00.000Z`,
  end: `${d}T20:00:00.000Z`,
  allDay: false,
}));
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test.use({ timezoneId: 'Europe/Paris' });

async function shot(page: Page, name: string) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `screens/${test.info().project.name}/d048-${name}.png` });
}

async function start(page: Page, state: MockState) {
  await mockAccount(page, state);
  await seedProfile(page, SCENARIOS.beginner);
  await page.clock.setFixedTime(MONDAY);
}

test('iCal link', async ({ page }) => {
  const state: MockState = { feed: null, calls: [], busy: EVENINGS };
  await start(page, state);
  await page.goto(`${ACCOUNT}/calendar`);
  await shot(page, 'calendar-empty');
  await page.getByLabel(/Lien iCal|iCal link/).fill('webcal://edt.example.fr/export/cours.ics');
  await page.getByRole('button', { name: /Tester le lien|Test the link/ }).click();
  await page
    .getByText(/edt\.example\.fr/)
    .first()
    .waitFor();
  await shot(page, 'calendar-tested');
  await page.getByRole('button', { name: /Utiliser ce calendrier|Use this calendar/ }).click();
  await page.getByRole('switch').first().waitFor();
  await shot(page, 'calendar-linked');
  await page.goto(`${ACCOUNT}/program`);
  await page.waitForLoadState('networkidle');
  await shot(page, 'program-with-ical');
});

test('meal photo', async ({ page }) => {
  const state: MockState = {
    feed: null,
    calls: [],
    busy: [],
    analysis: {
      status: 200,
      body: { items: [{ label: 'Saumon', foodId: 'salmon', grams: 120, confidence: 0.7 }], model: 'vision-x' },
    },
  };
  await start(page, state);
  await page.goto(`${ACCOUNT}/meal-analysis`);
  await shot(page, 'meal-start');
  const chooser = page.waitForEvent('filechooser');
  await page
    .getByRole('button', { name: /Choisir (dans la galerie|une photo)|Choose/ })
    .first()
    .click();
  await (await chooser).setFiles({ name: 'repas.png', mimeType: 'image/png', buffer: PNG });
  await page.getByRole('button', { name: /^Analyser$|^Analyse$/ }).click();
  await page
    .getByText(/Ciqual/)
    .first()
    .waitFor();
  await shot(page, 'meal-draft');
});

test('meal photo, every provider failed', async ({ page }) => {
  const state: MockState = {
    feed: null,
    calls: [],
    busy: [],
    analysis: { status: 502, body: { error: 'analysis_failed', reason: 'quota', tried: 2 } },
  };
  await start(page, state);
  await page.goto(`${ACCOUNT}/meal-analysis`);
  const chooser = page.waitForEvent('filechooser');
  await page
    .getByRole('button', { name: /Choisir (dans la galerie|une photo)|Choose/ })
    .first()
    .click();
  await (await chooser).setFiles({ name: 'repas.png', mimeType: 'image/png', buffer: PNG });
  await page.getByRole('button', { name: /^Analyser$|^Analyse$/ }).click();
  await page
    .getByText(/quota|crédit|credit/i)
    .first()
    .waitFor();
  await shot(page, 'meal-failed');
});
