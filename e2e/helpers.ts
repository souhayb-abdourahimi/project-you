import type { Page } from '@playwright/test';

import type { UserContextSnapshot } from '../src/domain/profile/schemas';

/** Starts the app in local mode with an already completed profile (MOCK scenario). */
export async function seedProfile(page: Page, snapshot: UserContextSnapshot) {
  await page.addInitScript((value) => {
    if (!localStorage.getItem('py.profile.v1')) {
      localStorage.setItem(
        'py.profile.v1',
        JSON.stringify({ state: { snapshot: value, localMode: true }, version: 1 }),
      );
    }
  }, snapshot);
}

/** Fails the test on any uncaught page error. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

export async function openTab(page: Page, name: string) {
  await page
    .getByRole('tab', { name })
    .or(page.getByText(name, { exact: true }))
    .filter({ visible: true })
    .first()
    .click();
}

/** Tab screens stay mounted when hidden, so every lookup keeps only visible elements. */
export const button = (page: Page, name: string | RegExp) =>
  page
    .getByRole('button', { name, exact: typeof name === 'string' })
    .filter({ visible: true })
    .first();

export const text = (page: Page, value: string | RegExp) => page.getByText(value).filter({ visible: true }).first();

export const field = (page: Page, label: string | RegExp) => page.getByLabel(label).filter({ visible: true }).first();

/**
 * Screens depend on the day and time (session of the day, week review). Tests run at a fixed
 * moment: Wednesday 30 September 2026, 10:00 local time, when the sample profiles have a session.
 */
export async function freezeClock(page: Page) {
  await page.clock.setFixedTime(new Date(2026, 8, 30, 10, 0));
}

/** Seeds the local data store (`py.data.v1`) before the app starts: a recorded history. */
export async function seedData(page: Page, state: Record<string, unknown>) {
  await page.addInitScript((value) => {
    if (!localStorage.getItem('py.data.v1')) {
      localStorage.setItem('py.data.v1', JSON.stringify({ state: value, version: 3 }));
    }
  }, state);
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * A plausible recorded history (MOCK): two sessions a week (Monday, Thursday) from `from` to `to`,
 * goblet squat loads going up 2 kg a week, weigh-ins three mornings a week, waist every two weeks.
 */
export function history({
  from,
  to,
  startKg = 80,
  kgPerWeek = -0.3,
  waist = true,
}: {
  from: string;
  to: string;
  startKg?: number;
  kgPerWeek?: number;
  waist?: boolean;
}) {
  const completedSessions: { date: string; sessionIndex: number; variant: string; completedAt: string }[] = [];
  const setLogs: Record<string, Record<string, { reps: number; loadKg: number }[]>> = {};
  const weights: { id: string; date: string; weightKg: number }[] = [];
  const waistEntries: { id: string; date: string; cm: number }[] = [];
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  for (let d = new Date(start), i = 0; d <= end; d.setDate(d.getDate() + 1), i++) {
    const date = iso(d);
    const week = Math.floor(i / 7);
    const weekday = d.getDay();
    if (weekday === 1 || weekday === 4) {
      const sessionIndex = weekday === 1 ? 0 : 1;
      completedSessions.push({ date, sessionIndex, variant: 'full', completedAt: `${date}T18:00:00.000Z` });
      setLogs[`${date}#${sessionIndex}`] = { goblet_squat: [{ reps: 8, loadKg: 16 + 2 * week }] };
    }
    if (weekday === 1 || weekday === 3 || weekday === 5) {
      weights.push({ id: `w-${date}`, date, weightKg: Math.round((startKg + (kgPerWeek * i) / 7) * 10) / 10 });
    }
    if (waist && i % 14 === 0) waistEntries.push({ id: `c-${date}`, date, cm: 90 - week * 0.5 });
  }
  return { completedSessions, setLogs, weights, waist: waistEntries };
}
