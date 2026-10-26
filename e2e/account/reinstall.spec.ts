import { expect, test } from '@playwright/test';

import { SCENARIOS } from '../../src/domain/scenarios';
import { project, SYNC_TABLE_ORDER, type SyncableState } from '../../src/domain/sync/projection';
import { collectErrors, text } from '../helpers';
import { mockAccount, USER_ID, type MockState } from './supabase-mock';

/**
 * Reinstalled PWA, then sign-in (D-052): nothing on the device, the profile on the server. The app
 * waits for the account's own pull and opens Today; it never shows the questionnaire first. A new
 * account (nothing on the server) still gets the questionnaire.
 */
const empty: SyncableState = {
  snapshot: null,
  inventory: [],
  weights: [],
  waist: [],
  expenses: [],
  mealPlan: null,
  completedSessions: [],
  setLogs: {},
  sessionIds: {},
};

function accountRows() {
  const projected = project({ ...empty, snapshot: SCENARIOS.beginner }, USER_ID);
  const at = '2026-10-20T10:00:00.000Z';
  return Object.fromEntries(
    SYNC_TABLE_ORDER.map((t) => [t, [...projected[t].values()].map((r) => ({ ...r, updated_at: at }))]),
  );
}

function slowPull(state: MockState) {
  let release!: () => void;
  state.pullGate = new Promise<void>((resolve) => (release = resolve));
  return () => release();
}

test('existing account on a fresh install: loading during the pull, then Today, never the questionnaire', async ({
  page,
}) => {
  const errors = collectErrors(page);
  const state: MockState = { feed: null, calls: [], busy: [], rows: accountRows() };
  const release = slowPull(state);
  await mockAccount(page, state);
  const visited: string[] = [];
  page.on('framenavigated', (f) => f === page.mainFrame() && visited.push(new URL(f.url()).pathname));

  await page.goto('/');
  // The pull is held: the app waits (loading), it does not decide.
  await expect(page.getByRole('progressbar').first()).toBeVisible();
  await expect.poll(() => (state.reads ?? []).length).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  expect(page.url()).not.toContain('/onboarding');

  release();
  await expect(text(page, /Alex/).first()).toBeVisible();
  expect(page.url()).not.toContain('/onboarding');
  expect(visited.some((p) => p.includes('onboarding'))).toBe(false);
  // The profile came back from the server, not from a questionnaire.
  const saved = await page.evaluate(() => localStorage.getItem('py.profile.v1') ?? '');
  expect(saved).toContain('"displayName":"Alex (MOCK)"');
  expect(errors).toEqual([]);
});

test('new account (nothing on the server): loading, then the questionnaire', async ({ page }) => {
  const state: MockState = { feed: null, calls: [], busy: [] };
  const release = slowPull(state);
  await mockAccount(page, state);
  await page.goto('/');
  await expect(page.getByRole('progressbar').first()).toBeVisible();
  await page.waitForTimeout(300);
  expect(page.url()).not.toContain('/onboarding');
  release();
  await expect(page).toHaveURL(/\/onboarding$/);
});
