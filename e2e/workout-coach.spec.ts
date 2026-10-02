import { expect, test, type Page } from '@playwright/test';

import { SCENARIOS } from '../src/domain/scenarios';
import { button, collectErrors, freezeClock, seedProfile, text } from './helpers';

/** Workout Coach W-2 (D-032): publish once, read back, variants stored, off-plan sessions. */

interface StoredTraining {
  programs?: { id: string; version: number; status: string }[];
  prescriptions?: Record<string, { id: string; exercises: { id: string; variant: string; exerciseId: string }[] }>;
  sessionIds?: Record<string, string>;
  sessionSources?: Record<string, { source: string }>;
}

const stored = (page: Page) =>
  page.evaluate(() => (JSON.parse(localStorage.getItem('py.data.v1') ?? '{}').state ?? {}) as StoredTraining);

const WEDNESDAY = '2026-09-30#1';

test('the week is published once, then read back after a reload, never rebuilt', async ({ page }) => {
  const errors = collectErrors(page);
  await freezeClock(page);
  await seedProfile(page, SCENARIOS.muscleGain);
  await page.goto('/workout/2026-09-30');
  await expect(text(page, 'Terminer la séance')).toBeVisible();
  await expect.poll(async () => (await stored(page)).programs?.length).toBe(1);
  const first = await stored(page);
  expect(first.programs![0]).toMatchObject({ version: 1, status: 'active' });
  const wednesday = first.prescriptions![first.sessionIds![WEDNESDAY]];
  expect(wednesday.exercises.length).toBeGreaterThan(0);

  await page.reload();
  await expect(text(page, 'Terminer la séance')).toBeVisible();
  const again = await stored(page);
  expect(again.programs).toEqual(first.programs);
  expect(again.prescriptions).toEqual(first.prescriptions);
  expect(errors).toEqual([]);
});

test('a light version is stored as its own rows; the full prescription does not change', async ({ page }) => {
  const errors = collectErrors(page);
  await freezeClock(page);
  await seedProfile(page, SCENARIOS.muscleGain);
  await page.goto('/workout/2026-09-30');
  await expect.poll(async () => (await stored(page)).programs?.length).toBe(1);
  const before = await stored(page);
  const id = before.sessionIds![WEDNESDAY];
  const full = before.prescriptions![id].exercises;

  await page.goto('/workout/2026-09-30?variant=light');
  await expect(text(page, 'Version allégée')).toBeVisible();
  await expect
    .poll(async () => (await stored(page)).prescriptions![id].exercises.filter((e) => e.variant === 'light').length)
    .toBeGreaterThan(0);
  const after = (await stored(page)).prescriptions![id].exercises;
  expect(after.filter((e) => e.variant === 'full')).toEqual(full);
  expect(errors).toEqual([]);
});

test('a session on a day without one is recorded off plan, with no invented prescription', async ({ page }) => {
  const errors = collectErrors(page);
  await freezeClock(page);
  await seedProfile(page, SCENARIOS.muscleGain);
  await page.goto('/workout/2026-10-04?variant=short');
  await expect(text(page, 'Terminer la séance')).toBeVisible();
  await page.getByLabel('Répétitions').filter({ visible: true }).first().fill('12');
  await button(page, 'Valider la série').click();
  await expect.poll(async () => (await stored(page)).sessionSources?.['2026-10-04#0']?.source).toBe('off_plan');
  const s = await stored(page);
  expect(s.prescriptions![s.sessionIds!['2026-10-04#0']]).toBeUndefined();
  expect(errors).toEqual([]);
});
