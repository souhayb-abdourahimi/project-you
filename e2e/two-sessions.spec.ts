import { expect, test } from '@playwright/test';

import { SCENARIOS } from '../src/domain/scenarios';
import { publishWeek } from '../src/domain/scenarios/training';
import { sessionKey } from '../src/domain/shared/ids';
import { getExercise } from '../src/domain/training/exercises';
import { keptSession, prescriptionFor } from '../src/domain/training/week';
import { button, collectErrors, freezeClock, openTab, seedData, seedProfile, text } from './helpers';

/**
 * W-7.1: a day can hold two real sessions (D-033: the same slot used on two devices). Each one
 * opens itself, never the first of the day by default, and no technical id is shown.
 */

const SNAP = SCENARIOS.muscleGain;
const WEDNESDAY = sessionKey('2026-09-30', 1);
const EXTRA = sessionKey('2026-09-30', 7);

function twoSessionsOnWednesday() {
  const week = publishWeek(SNAP, { today: '2026-09-28', weekStart: '2026-09-28', seed: 'local', at: 'x' });
  const planned = prescriptionFor(week, WEDNESDAY)!;
  // The other device's session for the same slot: another prescription, already started.
  const reversed = { ...planned, exercises: [...planned.exercises].reverse().map((e, i) => ({ ...e, position: i })) };
  const other = keptSession(reversed, planned.programId, EXTRA);
  const first = (p: typeof planned) => p.exercises.filter((e) => e.variant === 'full')[0].exerciseId;
  return {
    data: {
      ...week,
      prescriptions: { ...week.prescriptions, [other.id]: other },
      sessionIds: { ...week.sessionIds, [EXTRA]: other.id },
      sessionSlots: { [EXTRA]: WEDNESDAY },
      sessionOpened: { [EXTRA]: '2026-09-30T07:00:00.000Z' },
      setLogs: { [EXTRA]: { [first(other)]: [{ reps: 8, loadKg: 20 }] } },
    },
    names: [first(planned), first(other)].map((id) => getExercise(id)!.name.fr),
    ids: [planned.id, other.id],
  };
}

test('two sessions the same day: each link opens its own session', async ({ page }) => {
  const errors = collectErrors(page);
  const { data, names, ids } = twoSessionsOnWednesday();
  expect(names[0]).not.toBe(names[1]);
  await freezeClock(page);
  await seedProfile(page, SNAP);
  await seedData(page, data);
  await page.goto('/');
  await openTab(page, 'Programme');
  await expect(text(page, 'Séance supplémentaire')).toBeVisible();

  // Today's card on the Programme: the planned session, then the extra one.
  const today = text(page, /^Aujourd’hui · /).locator('xpath=..');
  const open = today.getByRole('button', { name: /^(Ouvrir la séance|Voir)/ });
  await expect(open).toHaveCount(2);
  await open.nth(1).click();
  await expect(page).toHaveURL(/index=7/);
  await expect(text(page, names[1])).toBeVisible();
  for (const id of ids) await expect(page.getByText(id)).toHaveCount(0);

  // And the planned one opens itself.
  await page.goBack();
  await openTab(page, 'Programme');
  await open.nth(0).click();
  await expect(page).toHaveURL(/index=1/);
  await expect(text(page, names[0])).toBeVisible();
  expect(errors).toEqual([]);
});
