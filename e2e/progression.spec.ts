import { expect, test, type Page } from '@playwright/test';

import { SCENARIOS } from '../src/domain/scenarios';
import { button, collectErrors, freezeClock, openTab, seedData, seedProfile, text } from './helpers';

/** Workout Coach W-4 (D-035): the progression, from a real session to the next prescription. */

interface Row {
  variant: string;
  exerciseId: string;
  targetLoadKg: number | null;
  progressionAction: string | null;
  progressionReason: string | null;
  targetReps: number | null;
}
interface Stored {
  sessionIds?: Record<string, string>;
  prescriptions?: Record<string, { exercises: Row[] }>;
  superseded?: Record<string, true>;
}

const stored = (page: Page) =>
  page.evaluate(() => (JSON.parse(localStorage.getItem('py.data.v1') ?? '{}').state ?? {}) as Stored);
const benchOn = (s: Stored, key: string) =>
  s.prescriptions?.[s.sessionIds?.[key] ?? '']?.exercises.find(
    (e) => e.variant === 'full' && e.exerciseId === 'bench_press',
  );

const MONDAY = '2026-09-28#0';
const WEDNESDAY = '2026-09-30#1';
const BENCH = /^Développé couché barre, À faire$/;
const top = (load: number) => [10, 10, 10].map((reps) => ({ reps, loadKg: load }));
const done = (date: string, sessionIndex: number, variant = 'full') => ({
  date,
  sessionIndex,
  variant,
  completedAt: `${date}T18:00:00.000Z`,
});
const field = (page: Page, label: string) => page.getByLabel(label, { exact: true }).filter({ visible: true }).first();

async function openBench(page: Page, date: string) {
  await page.goto(`/workout/${date}?variant=full`);
  await expect(button(page, 'Valider la série')).toBeVisible();
  await page.getByRole('button', { name: BENCH }).filter({ visible: true }).first().click();
}

async function why(page: Page) {
  await button(page, 'Pourquoi cet exercice ?').click();
}

test('a successful session → the next session is proposed, the past stays, "Pourquoi ?" says why', async ({ page }) => {
  const errors = collectErrors(page);
  // Monday morning: last Friday (off plan) 60 × 10 × 3 on the bench.
  await page.clock.setFixedTime(new Date(2026, 8, 28, 10, 0));
  await seedProfile(page, SCENARIOS.muscleGain);
  await seedData(page, {
    setLogs: { '2026-09-25#0': { bench_press: top(60) } },
    completedSessions: [done('2026-09-25', 0)],
  });
  await openBench(page, '2026-09-28');
  // One session is a first reading: the same load, the top of the range as the goal.
  await expect(text(page, 'Proposé : 60 kg × 10 reps')).toBeVisible();
  await expect(text(page, 'On garde la même charge.')).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await button(page, 'Valider la série').click();
    if (i < 2) await button(page, 'Ignorer le repos').click();
  }
  await expect(text(page, 'Exercice terminé')).toBeVisible();
  await button(page, 'Terminer la séance').click();
  await button(page, 'Terminer maintenant').click();
  await expect(text(page, 'Séance terminée')).toBeVisible();
  const monday = benchOn(await stored(page), MONDAY);

  // Back on Today: Wednesday, not started, follows Monday.
  await page.goto('/');
  await openTab(page, 'Aujourd’hui');
  await expect.poll(async () => benchOn(await stored(page), WEDNESDAY)?.progressionAction).toBe('increase_load');
  const s = await stored(page);
  expect(benchOn(s, WEDNESDAY)).toMatchObject({ targetLoadKg: 62.5, targetReps: 6 });
  // Monday, done, keeps exactly what it was prescribed (60 kg).
  expect(benchOn(s, MONDAY)).toEqual(monday);
  expect(monday).toMatchObject({ targetLoadKg: 60 });

  await openBench(page, '2026-09-30');
  await expect(text(page, 'Proposé : 62,5 kg × 6 reps')).toBeVisible();
  await expect(text(page, 'Petite hausse proposée.')).toBeVisible();
  await why(page);
  await expect(text(page, /haut de ta plage \(10\) 2 fois : petite hausse proposée \(\+2,5 kg\)/)).toBeVisible();
  await expect(text(page, 'Basé sur quelques séances.')).toBeVisible();
  expect(errors).toEqual([]);
});

const twoTops = {
  setLogs: { '2026-09-25#0': { bench_press: top(60) }, [MONDAY]: { bench_press: top(60) } },
  completedSessions: [done('2026-09-25', 0), done('2026-09-28', 0)],
};

test('high fatigue declared today: the increase waits, the load is kept, and it says so', async ({ page }) => {
  const errors = collectErrors(page);
  await freezeClock(page);
  await seedProfile(page, SCENARIOS.muscleGain);
  await seedData(page, { ...twoTops, dayLogs: [{ date: '2026-09-30', energy: 2, motivation: 3, fatigue: 4 }] });
  await page.goto('/');
  await openTab(page, 'Aujourd’hui');
  await expect
    .poll(async () => benchOn(await stored(page), WEDNESDAY)?.progressionReason)
    .toBe('progression.reason.held_fatigue');
  expect(benchOn(await stored(page), WEDNESDAY)).toMatchObject({ targetLoadKg: 60, progressionAction: 'maintain' });
  await openBench(page, '2026-09-30');
  await expect(text(page, 'Proposé : 60 kg × 10 reps')).toBeVisible();
  await expect(text(page, 'On garde la même charge.')).toBeVisible();
  await why(page);
  await expect(text(page, /Fatigue déclarée aujourd’hui : on garde la même charge/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('a short session lower than usual is not a regression: the load stays', async ({ page }) => {
  const errors = collectErrors(page);
  await freezeClock(page);
  await seedProfile(page, SCENARIOS.muscleGain);
  await seedData(page, {
    // The bench range is 6–10: 5 reps in a short session, under the range.
    setLogs: { '2026-09-25#0': { bench_press: top(60) }, [MONDAY]: { bench_press: [{ reps: 5, loadKg: 60 }] } },
    completedSessions: [done('2026-09-25', 0), done('2026-09-28', 0, 'short')],
  });
  await openBench(page, '2026-09-30');
  const bench = benchOn(await stored(page), WEDNESDAY)!;
  expect(bench).toMatchObject({ targetLoadKg: 60, progressionAction: 'maintain' });
  expect(bench.progressionAction).not.toBe('reduce_load');
  await why(page);
  await expect(text(page, /Version courte : moins de volume, ce n’est pas une baisse de niveau/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('light weeks do not make a plateau or a drop: the next goal builds on the full sessions', async ({ page }) => {
  const errors = collectErrors(page);
  await freezeClock(page);
  await seedProfile(page, SCENARIOS.muscleGain);
  const nine = [9, 9, 9].map((reps) => ({ reps, loadKg: 60 }));
  const light = [8, 8].map((reps) => ({ reps, loadKg: 40 }));
  await seedData(page, {
    setLogs: {
      '2026-09-01#0': { bench_press: nine },
      '2026-09-08#0': { bench_press: nine },
      '2026-09-15#0': { bench_press: light },
      '2026-09-22#0': { bench_press: light },
      [MONDAY]: { bench_press: light },
    },
    completedSessions: [
      done('2026-09-01', 0),
      done('2026-09-08', 0),
      done('2026-09-15', 0, 'light'),
      done('2026-09-22', 0, 'light'),
      done('2026-09-28', 0, 'light'),
    ],
  });
  await openBench(page, '2026-09-30');
  expect(benchOn(await stored(page), WEDNESDAY)).toMatchObject({
    targetLoadKg: 60,
    progressionAction: 'increase_reps',
    targetReps: 10,
  });
  await expect(text(page, 'Tu peux viser une répétition de plus.')).toBeVisible();
  // Mon évolution: no "40 kg" drop, no advice to review the progression.
  await page.goto('/');
  await openTab(page, 'Progrès');
  await expect(text(page, 'Revoir la progression de tes charges')).toBeHidden();
  await expect(page.getByText(/Développé couché barre : .*40 kg/).filter({ visible: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
