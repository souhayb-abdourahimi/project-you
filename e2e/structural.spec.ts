import { expect, test, type Page } from '@playwright/test';

import { SCENARIOS } from '../src/domain/scenarios';
import { button, collectErrors, freezeClock, openTab, seedData, seedProfile, text } from './helpers';

/**
 * Workout Coach W-5 (D-036, D-037): structural changes are proposed, explained, and applied only
 * after the user's answer; every answer is kept; going back is always possible.
 */

interface Stored {
  adjustments?: { changeKey: string; status: string; proposalId?: string; scope?: string | null; from?: unknown }[];
  programs?: { version: number; status: string; params: { excludedExerciseIds: string[] } | null }[];
}
const stored = (page: Page) =>
  page.evaluate(() => (JSON.parse(localStorage.getItem('py.data.v1') ?? '{}').state ?? {}) as Stored);
const answers = async (page: Page) => (await stored(page)).adjustments?.map((a) => [a.changeKey, a.status]) ?? [];

const done = (date: string, sessionIndex = 0) => ({
  date,
  sessionIndex,
  variant: 'full',
  completedAt: `${date}T18:00:00.000Z`,
});

/** Three full sessions in two weeks, fatigue declared three days running (Wednesday 30 September). */
const tiredWeek = {
  completedSessions: [done('2026-09-21'), done('2026-09-24'), done('2026-09-28')],
  dayLogs: ['2026-09-28', '2026-09-29', '2026-09-30'].map((date) => ({ date, energy: 2, motivation: 3, fatigue: 5 })),
};

/**
 * The bench press bothered twice, on two sessions (a reason the user gave, never a diagnosis).
 * Monday's session was done too: not a comeback day, where only a gentle restart may lead (W-7).
 */
const discomfort = {
  completedSessions: [done('2026-09-21'), done('2026-09-24'), done('2026-09-28')],
  swapReasons: {
    '2026-09-21#0': { bench_press: 'discomfort' },
    '2026-09-24#0': { bench_press: 'discomfort' },
  },
  exerciseSwaps: {
    '2026-09-21#0': { bench_press: 'push_up' },
    '2026-09-24#0': { bench_press: 'push_up' },
  },
};

async function start(page: Page, data: Record<string, unknown>) {
  await freezeClock(page);
  await seedProfile(page, SCENARIOS.muscleGain);
  await seedData(page, data);
  await page.goto('/');
}

test('light week: proposed on Today with its facts, applied on "yes", shown, then undone', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, tiredWeek);
  await expect(button(page, 'Alléger cette semaine')).toBeVisible();
  await expect(text(page, 'Durée : 7 jours, puis retour à ton programme habituel.')).toBeVisible();
  await button(page, 'Pourquoi ?').click();
  await expect(text(page, '3 jour(s) de fatigue déclarée')).toBeVisible();
  // Nothing changed before the answer.
  expect(await answers(page)).toEqual([]);

  await button(page, 'Alléger cette semaine').click();
  await expect(button(page, 'Alléger cette semaine')).toHaveCount(0);
  await expect.poll(() => answers(page)).toEqual([['light_week', 'applied']]);
  expect((await stored(page)).adjustments?.[0]).toMatchObject({ scope: 'week', proposalId: expect.any(String) });

  await openTab(page, 'Programme');
  await expect(text(page, 'Semaine allégée')).toBeVisible();
  await openTab(page, 'Progrès');
  await expect(text(page, 'Programme allégé cette semaine')).toBeVisible();

  // Going back: a new decision, the first one stays in the journal.
  await button(page, 'Revenir en arrière').click();
  await expect
    .poll(() => answers(page))
    .toEqual([
      ['light_week', 'applied'],
      ['light_week', 'reverted'],
    ]);
  await expect(text(page, 'Programme allégé cette semaine')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('"Pas maintenant" is not a refusal; "Refuser" is kept with its context', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, tiredWeek);
  await button(page, /^Pas maintenant : /).click();
  await expect(button(page, 'Alléger cette semaine')).toHaveCount(0);
  await expect.poll(() => answers(page)).toEqual([['light_week', 'postponed']]);
  expect(errors).toEqual([]);
});

test('"Refuser": recorded, nothing changes in the program', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, tiredWeek);
  await button(page, /^Refuser : /).click();
  await expect.poll(() => answers(page)).toEqual([['light_week', 'declined']]);
  await openTab(page, 'Programme');
  await expect(text(page, 'Semaine allégée')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('repeated discomfort: a question, a confirmation, then a new program version', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, discomfort);
  await expect(
    text(page, 'Cet exercice t’a gêné plusieurs fois. Veux-tu le remplacer dans ton programme ?'),
  ).toBeVisible();
  await expect(text(page, /blessure/)).toHaveCount(0);
  await button(page, 'Le remplacer').click();
  // Two steps for a durable change: nothing applied before the confirmation.
  await expect(text(page, /C’est un changement durable/)).toBeVisible();
  expect(await answers(page)).toEqual([]);
  await button(page, 'Confirmer').click();
  await expect.poll(() => answers(page)).toEqual([['exercise_change', 'applied']]);
  await expect
    .poll(async () => (await stored(page)).programs?.find((p) => p.status === 'active')?.params?.excludedExerciseIds)
    .toContain('bench_press');
  const programs = (await stored(page)).programs ?? [];
  expect(programs.map((p) => [p.version, p.status])).toEqual([
    [1, 'superseded'],
    [2, 'active'],
  ]);
  await openTab(page, 'Progrès');
  await expect(text(page, 'Exercice remplacé après confirmation')).toBeVisible();
  expect(errors).toEqual([]);
});

test('"Le garder": the exercise stays, the answer is kept', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, discomfort);
  await button(page, /^Le garder : /).click();
  await expect.poll(() => answers(page)).toEqual([['exercise_change', 'declined']]);
  const active = (await stored(page)).programs?.find((p) => p.status === 'active');
  expect(active?.params?.excludedExerciseIds).not.toContain('bench_press');
  expect(errors).toEqual([]);
});
