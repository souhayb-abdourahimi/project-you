import { expect, test, type Page } from '@playwright/test';

import { SCENARIOS } from '../src/domain/scenarios';
import { button, collectErrors, freezeClock, seedData, seedProfile, text } from './helpers';

/**
 * Coach of the day, W-7 (D-039): one thing leads, a cause is asked and never guessed, a habit is
 * kept only after "oui" and forgotten in one tap. Nothing is said about what was not done.
 */

interface Stored {
  adjustments?: { changeKey: string; status: string; to?: unknown }[];
}
const stored = (page: Page) =>
  page.evaluate(() => (JSON.parse(localStorage.getItem('py.data.v1') ?? '{}').state ?? {}) as Stored);
const coachRows = async (page: Page) =>
  ((await stored(page)).adjustments ?? [])
    .filter((a) => a.changeKey.startsWith('coach.'))
    .map((a) => [a.changeKey, a.status, a.to]);

const SNAP = SCENARIOS.muscleGain;
const session = (date: string, sessionIndex: number, variant = 'full') => ({
  date,
  sessionIndex,
  variant,
  completedAt: `${date}T18:00:00.000Z`,
});
/** Milestones already celebrated on an earlier day: today is not a celebration day. */
const celebrated = (...ids: string[]) =>
  Object.fromEntries(ids.map((id) => [id, { reachedOn: '2026-09-16', celebratedAt: '2026-09-16T19:00:00.000Z' }]));
/**
 * Started eleven days ago (still calibrating: no plan change proposed yet), one session, a walk
 * yesterday: the planned sessions since then have no record.
 */
const quietWeeks = {
  completedSessions: [session('2026-09-18', 2)],
  dayLogs: [{ date: '2026-09-28', activity: 'walk', activityMinutes: 20 }],
};

test('a rest day after sessions that did not happen: one question, a closed answer, an action', async ({ page }) => {
  const errors = collectErrors(page);
  await page.clock.setFixedTime(new Date(2026, 8, 29, 10, 0));
  await seedProfile(page, SNAP);
  await seedData(page, quietWeeks);
  await page.goto('/');
  await expect(text(page, 'J’ai vu que plusieurs séances prévues n’ont pas eu lieu récemment.')).toBeVisible();
  await expect(text(page, 'Qu’est-ce qui t’a le plus bloqué ?')).toBeVisible();
  // Never a count of what was not done, never a reproach.
  await expect(page.getByText(/raté|manqué|échec|tu n’as pas/i)).toHaveCount(0);
  await button(page, 'Ce qui m’a le plus bloqué : Manque de temps').click();
  await expect.poll(() => coachRows(page)).toEqual([['coach.blocker', 'applied', 'time']]);
  await expect(text(page, /C’est noté : le temps/)).toBeVisible();
  await expect(button(page, 'Déplacer une séance')).toBeVisible();
  await expect(text(page, 'Qu’est-ce qui t’a le plus bloqué ?')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('"Pas maintenant": the question goes away and nothing is recorded as a cause', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 8, 29, 10, 0));
  await seedProfile(page, SNAP);
  await seedData(page, quietWeeks);
  await page.goto('/');
  await button(page, 'Pas maintenant').click();
  await expect.poll(() => coachRows(page)).toEqual([['coach.blocker', 'postponed', null]]);
  await expect(text(page, 'Qu’est-ce qui t’a le plus bloqué ?')).toHaveCount(0);
});

test('an ordinary day: nothing to adjust, the plan, and no quote of the user’s own words', async ({ page }) => {
  const errors = collectErrors(page);
  await freezeClock(page);
  await seedProfile(page, SNAP);
  await seedData(page, { completedSessions: [session('2026-09-28', 0)], milestones: celebrated('first_session') });
  await page.goto('/');
  await expect(text(page, 'Rien de particulier à ajuster aujourd’hui.')).toBeVisible();
  await expect(text(page, 'Pourquoi tu as commencé')).toHaveCount(0);
  await button(page, 'Pourquoi ce choix ?').click();
  await expect(text(page, 'Une séance est prévue aujourd’hui : c’est l’action principale.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a habit: observed, asked, kept after "oui", visible in Réglages and forgotten in one tap', async ({ page }) => {
  const errors = collectErrors(page);
  // Two Wednesdays where the user chose "J'ai 15 minutes", and today is a Wednesday. The other
  // sessions happened: nothing else leads today.
  await freezeClock(page);
  await seedProfile(page, SNAP);
  await seedData(page, {
    completedSessions: [
      session('2026-09-16', 1, 'short'),
      session('2026-09-18', 2),
      session('2026-09-23', 1, 'short'),
      session('2026-09-25', 2),
      session('2026-09-28', 0),
    ],
    milestones: celebrated('first_session', 'first_week', 'sessions_5', 'weeks_streak_2'),
    dayLogs: [
      { date: '2026-09-16', mode: 'short', availableMinutes: 15 },
      { date: '2026-09-23', mode: 'short', availableMinutes: 15 },
    ],
    // A cause given in the weekly check-in: the coach does not ask again what got in the way.
    weeklyCheckins: [
      { weekStart: '2026-09-21', weekRating: 3, mainProblem: 'time', answeredAt: '2026-09-28T09:00:00.000Z' },
    ],
  });
  await page.goto('/');
  await expect(text(page, 'Tu as choisi une séance courte 2 fois le mercredi.')).toBeVisible();
  await button(page, 'Oui, garde-le en tête').click();
  await expect.poll(() => coachRows(page)).toEqual([['coach.memory.short_day', 'applied', 'short']]);
  // Today, the short version is offered; the planned session stays the plan.
  await expect(button(page, 'Faire la version courte')).toBeVisible();

  await button(page, 'Réglages').click();
  await expect(text(page, 'Ce que le coach retient')).toBeVisible();
  await expect(text(page, /^Séance courte le mercredi/)).toBeVisible();
  await button(page, /^Oublier : Séance courte le mercredi/).click();
  await expect
    .poll(() => coachRows(page))
    .toEqual([
      ['coach.memory.short_day', 'applied', 'short'],
      ['coach.memory.short_day', 'reverted', 'short'],
    ]);
  await expect(text(page, /Le coach ne retient rien pour l’instant/)).toBeVisible();
  expect(errors).toEqual([]);
});
