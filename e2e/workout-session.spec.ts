import { expect, test, type Page } from '@playwright/test';

import { SCENARIOS } from '../src/domain/scenarios';
import { button, collectErrors, freezeClock, openTab, seedProfile, text } from './helpers';

/** Workout Coach W-3 (D-034): the real session, from the first set to the summary. */

interface Stored {
  setLogs?: Record<string, Record<string, { reps: number; loadKg: number; rpe?: number; seconds?: number }[]>>;
  exerciseSwaps?: Record<string, Record<string, string>>;
  swapReasons?: Record<string, Record<string, string>>;
  exerciseReports?: Record<
    string,
    Record<string, { notPerformed?: boolean; notPerformedReason?: string; difficulty?: number }>
  >;
  completedSessions?: { date: string; sessionIndex: number; variant: string; stopped?: string }[];
  sessionDifficulty?: Record<string, number>;
  sessionVariants?: Record<string, string>;
  sessionIds?: Record<string, string>;
  prescriptions?: Record<
    string,
    {
      adaptedMinutes: number | null;
      exercises: { variant: string; exerciseId: string; sets: number; targetRpe: number }[];
    }
  >;
}

const stored = (page: Page) =>
  page.evaluate(() => (JSON.parse(localStorage.getItem('py.data.v1') ?? '{}').state ?? {}) as Stored);

const WEDNESDAY = '2026-09-30#1';
const field = (page: Page, label: string) => page.getByLabel(label, { exact: true }).filter({ visible: true }).first();
const radio = (page: Page, name: string) =>
  page.getByRole('radio', { name, exact: true }).filter({ visible: true }).first();

async function open(page: Page, path = '/workout/2026-09-30') {
  await freezeClock(page);
  await seedProfile(page, SCENARIOS.muscleGain);
  await page.goto(path);
  await expect(button(page, 'Valider la série')).toBeVisible();
}

test('a full session: three sets, a correction, a skipped exercise, a replacement with its reason, the summary', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await open(page);
  await expect(text(page, 'Exercice 1 sur 5')).toBeVisible();
  // No history: the load field is empty, never guessed; it is asked for, not invented.
  await expect(field(page, 'Charge (kg)')).toHaveValue('');
  await button(page, 'Valider la série').click();
  await expect(text(page, 'Indique la charge utilisée (0 si tu n’en as pas pris).')).toBeVisible();

  await field(page, 'Charge (kg)').fill('40');
  await field(page, 'Répétitions').fill('8');
  await button(page, 'Valider la série').click();
  await expect(text(page, 'Série 1 : 40 kg × 8')).toBeVisible();
  // The rest starts by itself, and is never forced.
  await expect(text(page, 'Repos')).toBeVisible();
  await button(page, '+30 s').click();
  await button(page, 'Ignorer le repos').click();
  await expect(button(page, 'Ignorer le repos')).toBeHidden();

  // The next set opens with the set just done (reliable data).
  await expect(field(page, 'Charge (kg)')).toHaveValue('40');
  await radio(page, 'Très difficile').click();
  await expect(radio(page, 'Très difficile')).toHaveAttribute('aria-checked', 'true');
  await button(page, 'Valider la série').click();
  await expect(text(page, 'Cette série était très difficile ? Tu peux garder la même charge.')).toBeVisible();
  await field(page, 'Répétitions').fill('7');
  await button(page, 'Valider la série').click();
  await expect(text(page, 'Exercice terminé')).toBeVisible();
  await radio(page, 'Difficile').click();
  await expect(radio(page, 'Difficile')).toHaveAttribute('aria-checked', 'true');

  // Correct set 2 (the done part stays editable).
  await page
    .getByRole('button', { name: /Série 2 : 40 kg × 8/ })
    .filter({ visible: true })
    .first()
    .click();
  await expect(text(page, 'Correction de la série 2')).toBeVisible();
  await field(page, 'Répétitions').fill('9');
  await button(page, 'Enregistrer la correction').click();
  await expect(text(page, 'Série 2 : 40 kg × 9')).toBeVisible();
  let s = await stored(page);
  const first = Object.keys(s.setLogs![WEDNESDAY])[0];
  expect(s.setLogs![WEDNESDAY][first].map((x) => [x.loadKg, x.reps])).toEqual([
    [40, 8],
    [40, 9],
    [40, 7],
  ]);
  expect(s.setLogs![WEDNESDAY][first][1].rpe).toBe(10);
  expect(s.exerciseReports![WEDNESDAY][first]).toEqual({ difficulty: 4 });

  // Exercise 2: "Je ne fais pas cet exercice" — the prescription stays, the fact is recorded.
  await button(page, 'Exercice suivant').click();
  await expect(text(page, 'Exercice 2 sur 5')).toBeVisible();
  await button(page, 'Je ne fais pas cet exercice').click();
  await radio(page, 'Manque de temps').click();
  await button(page, 'Passer cet exercice').click();
  await expect(text(page, 'Exercice 3 sur 5')).toBeVisible();

  // Exercise 3: replaced, the reason asked first, the user picks the alternative.
  await button(page, 'Remplacer').click();
  await radio(page, 'Machine prise').click();
  await expect(text(page, 'Remplacement pour aujourd’hui seulement : ton programme ne change pas.')).toBeVisible();
  await page.getByTestId('alternatives').getByRole('button').first().click();
  await expect(text(page, /À la place de :/)).toBeVisible();

  s = await stored(page);
  const ids = s
    .prescriptions![s.sessionIds![WEDNESDAY]].exercises.filter((e) => e.variant === 'full')
    .map((e) => e.exerciseId);
  expect(s.exerciseReports![WEDNESDAY][ids[1]]).toEqual({ notPerformed: true, notPerformedReason: 'no_time' });
  expect(s.swapReasons![WEDNESDAY][ids[2]]).toBe('busy_equipment');
  expect(s.exerciseSwaps![WEDNESDAY][ids[2]]).not.toBe(ids[2]);
  // Planned ≠ done: the prescription is unchanged.
  expect(ids).toHaveLength(5);

  // Finish early: no judgement, a summary, one question.
  await button(page, 'Terminer la séance').click();
  await expect(text(page, 'Exercices restants : 3. Ce que tu as déjà fait compte.')).toBeVisible();
  await button(page, 'Terminer maintenant').click();
  await expect(text(page, 'Séance terminée')).toBeVisible();
  await expect(text(page, 'Séance faite en partie : ce que tu as fait compte.')).toBeVisible();
  await expect(text(page, '1 / 5')).toBeVisible();
  await radio(page, 'Correct').click();
  await expect(text(page, 'Merci, c’est noté.')).toBeVisible();
  s = await stored(page);
  expect(s.sessionDifficulty![WEDNESDAY]).toBe(3);
  expect(s.completedSessions!.filter((c) => c.date === '2026-09-30')).toEqual([
    expect.objectContaining({ sessionIndex: 1, variant: 'full' }),
  ]);

  // Reopened later: the summary, same data.
  await page.reload();
  await expect(text(page, 'Séance terminée')).toBeVisible();
  await expect(radio(page, 'Correct')).toHaveAttribute('aria-checked', 'true');
  expect(errors).toEqual([]);
});

test('discomfort: never "continue", replace or skip or end the session; ending records why', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  await button(page, 'Remplacer').click();
  await radio(page, 'Mouvement gênant ou inconfortable').click();
  await expect(text(page, /Arrête ce mouvement/)).toBeVisible();
  await expect(page.getByText(/continue/i).filter({ visible: true })).toHaveCount(0);
  await expect(button(page, 'Passer cet exercice')).toBeVisible();
  await button(page, 'Terminer la séance ici').click();
  await expect(text(page, 'Séance arrêtée en cours de route : c’est noté.')).toBeVisible();
  const s = await stored(page);
  expect(s.completedSessions!.find((c) => c.date === '2026-09-30')?.stopped).toBe('pain');
  expect(errors).toEqual([]);
});

test('"J’ai 15 minutes": the Daily Coach and the session say the same duration, the short rows are stored once', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await freezeClock(page);
  await seedProfile(page, SCENARIOS.muscleGain);
  await page.goto('/');
  await openTab(page, 'Aujourd’hui');
  await button(page, 'J’ai 15 minutes').click();
  await button(page, 'Séance courte (15 min)').click();
  await expect(text(page, 'Version courte')).toBeVisible();
  await expect(text(page, 'Environ 15 min')).toBeVisible();
  await expect(text(page, /Version courte : moins de temps/)).toBeVisible();
  await expect
    .poll(async () => {
      const s = await stored(page);
      return s.prescriptions?.[s.sessionIds![WEDNESDAY]]?.adaptedMinutes;
    })
    .toBe(15);
  const before = await stored(page);
  const short = before.prescriptions![before.sessionIds![WEDNESDAY]].exercises.filter((e) => e.variant === 'short');
  expect(short.length).toBeGreaterThan(0);
  // Back on Today: the same 15 minutes; reopening does not build another short version.
  await page.goto('/');
  await openTab(page, 'Aujourd’hui');
  await expect(text(page, /Version courte · .* · 15 min/)).toBeVisible();
  await page.goto('/workout/2026-09-30');
  await expect(text(page, 'Environ 15 min')).toBeVisible();
  const after = await stored(page);
  expect(after.prescriptions![after.sessionIds![WEDNESDAY]].exercises.filter((e) => e.variant === 'short')).toEqual(
    short,
  );
  expect(errors).toEqual([]);
});

test('light: same exercises, fewer sets, moderate effort, said clearly', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, '/workout/2026-09-30?variant=light');
  await expect(text(page, 'Version allégée')).toBeVisible();
  await expect(text(page, /mêmes exercices, moins de séries et un effort modéré/)).toBeVisible();
  const s = await stored(page);
  const rows = s.prescriptions![s.sessionIds![WEDNESDAY]].exercises;
  const full = rows.filter((e) => e.variant === 'full');
  const light = rows.filter((e) => e.variant === 'light');
  expect(light.map((e) => e.exerciseId)).toEqual(full.map((e) => e.exerciseId));
  expect(light.every((e, i) => e.sets <= full[i].sets && e.targetRpe <= 6)).toBe(true);
  expect(errors).toEqual([]);
});

test('offline: sets, a replacement and the end are kept on the device, nothing lost once back online', async ({
  page,
  context,
}) => {
  const errors = collectErrors(page);
  await open(page);
  await context.setOffline(true);
  await field(page, 'Charge (kg)').fill('30');
  await field(page, 'Répétitions').fill('10');
  await button(page, 'Valider la série').click();
  await button(page, 'Ignorer le repos').click();
  await button(page, 'Valider la série').click();
  await expect(text(page, 'Série 2 : 30 kg × 10')).toBeVisible();
  // Another exercise, replaced while offline.
  await page
    .getByRole('button', { name: /, À faire$/ })
    .filter({ visible: true })
    .first()
    .click();
  await expect(text(page, 'Exercice 2 sur 5')).toBeVisible();
  await button(page, 'Remplacer').click();
  await radio(page, 'Préférence personnelle').click();
  await page.getByTestId('alternatives').getByRole('button').first().click();
  await expect(text(page, /À la place de :/)).toBeVisible();
  await button(page, 'Terminer la séance').click();
  await button(page, 'Terminer maintenant').click();
  await expect(text(page, 'Séance terminée')).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await expect(text(page, 'Séance terminée')).toBeVisible();
  const s = await stored(page);
  expect(Object.values(s.setLogs![WEDNESDAY])[0]).toHaveLength(2);
  expect(Object.values(s.swapReasons![WEDNESDAY])).toEqual(['preference']);
  expect(s.completedSessions!.some((c) => c.date === '2026-09-30')).toBe(true);
  expect(errors).toEqual([]);
});
