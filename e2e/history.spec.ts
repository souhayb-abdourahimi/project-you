import { expect, test, type Page } from '@playwright/test';

import { SCENARIOS } from '../src/domain/scenarios';
import { publishWeek } from '../src/domain/scenarios/training';
import { sessionKey } from '../src/domain/shared/ids';
import { prescriptionFor } from '../src/domain/training/week';
import { button, collectErrors, freezeClock, openTab, seedData, seedProfile, text } from './helpers';

/**
 * Workout Coach W-6 (D-038): the week as planned and lived, the history in facts, and a session off
 * plan offered discreetly on a rest day. Nothing is estimated; nothing is called missed.
 */

const SNAP = SCENARIOS.muscleGain;
const MONDAY = sessionKey('2026-09-28', 0);

interface Stored {
  rescheduled?: Record<string, string>;
}
const stored = (page: Page) =>
  page.evaluate(() => (JSON.parse(localStorage.getItem('py.data.v1') ?? '{}').state ?? {}) as Stored);

/** Monday's session done in full: the same prescription the app publishes in local mode. */
function mondayDone() {
  const week = publishWeek(SNAP, { today: '2026-09-28', weekStart: '2026-09-28', seed: 'local', at: 'x' });
  const rows = prescriptionFor(week, MONDAY)!.exercises.filter((e) => e.variant === 'full');
  return {
    completedSessions: [
      { date: '2026-09-28', sessionIndex: 0, variant: 'full', completedAt: '2026-09-28T18:00:00.000Z' },
    ],
    setLogs: {
      [MONDAY]: Object.fromEntries(
        rows.map((e) => [e.exerciseId, Array.from({ length: e.sets }, () => ({ reps: e.repsMax, loadKg: 20 }))]),
      ),
    },
    sets: rows.reduce((n, e) => n + e.sets, 0),
  };
}

test('Programme: the lived week, a session moved, then the history in facts', async ({ page }) => {
  const errors = collectErrors(page);
  const { sets, ...data } = mondayDone();
  await freezeClock(page);
  await seedProfile(page, SNAP);
  await seedData(page, data);
  await page.goto('/');
  await openTab(page, 'Programme');

  await expect(text(page, /^Programme v1 · depuis le/)).toBeVisible();
  await expect(text(page, 'Faite')).toBeVisible();
  await expect(text(page, /^Aujourd’hui · /)).toBeVisible();

  // Today's session moves to Saturday (D-032): the original says where it went.
  await button(page, 'Déplacer').click();
  await page
    .getByRole('radio', { name: /samedi/ })
    .filter({ visible: true })
    .first()
    .click();
  await expect.poll(async () => (await stored(page)).rescheduled).toEqual({ '2026-09-30': '2026-10-03' });
  await expect(text(page, /^Déplacée au samedi/)).toBeVisible();

  await button(page, 'Voir l’historique').click();
  await expect(text(page, 'Cette semaine')).toBeVisible();
  await expect(text(page, '1 séance(s) faite(s) sur 3 prévue(s) pour l’instant')).toBeVisible();
  await expect(text(page, `${sets} série(s) sur ${sets} prévues dans les séances faites`)).toBeVisible();
  await expect(text(page, /Programme v1 · Ton premier programme/)).toBeVisible();
  // The session opens on its exercises, planned vs done.
  await page
    .getByRole('button', { name: /lundi 28 septembre/ })
    .filter({ visible: true })
    .first()
    .click();
  await expect(text(page, / : \d+ série\(s\) sur \d+$/)).toBeVisible();
  await expect(page.getByText(/raté|manqué|échec/)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Today on a rest day: a session off plan is offered, never on a training day', async ({ page }) => {
  const errors = collectErrors(page);
  await page.clock.setFixedTime(new Date(2026, 8, 29, 10, 0));
  await seedProfile(page, SNAP);
  await page.goto('/');
  await expect(button(page, 'Faire une séance hors programme')).toBeVisible();
  await button(page, 'Faire une séance hors programme').click();
  await expect(text(page, /Rien n’était prévu ce jour/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('Today on a training day: no session off plan offered', async ({ page }) => {
  await freezeClock(page);
  await seedProfile(page, SNAP);
  await page.goto('/');
  await expect(text(page, /Ta séance|Séance/)).toBeVisible();
  await expect(button(page, 'Faire une séance hors programme')).toHaveCount(0);
});

test('Progression: this week planned vs done, with the way to the history', async ({ page }) => {
  const errors = collectErrors(page);
  const { sets: _sets, ...data } = mondayDone();
  await freezeClock(page);
  await seedProfile(page, SNAP);
  await seedData(page, data);
  await page.goto('/');
  await openTab(page, 'Progression');
  await expect(text(page, '1 séance(s) faite(s) sur 3 prévue(s) pour l’instant')).toBeVisible();
  await expect(text(page, '2 séance(s) encore à venir')).toBeVisible();
  await button(page, 'Voir l’historique').click();
  await expect(text(page, /Ce qui était prévu et ce que tu as fait/)).toBeVisible();
  expect(errors).toEqual([]);
});
