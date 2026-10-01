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
