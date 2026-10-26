import { expect, test, type Page } from '@playwright/test';

import { SCENARIOS, scenario } from '../../src/domain/scenarios';
import { button, collectErrors, field, seedProfile, text } from '../helpers';
import { mockAccount, type MockState } from './supabase-mock';

/**
 * iCal link journey (D-049), signed in against the fake project: paste, test, use, sessions move
 * out of the busy times, switch off, delete. The function is the contract of
 * supabase/functions/calendar-feed (its own tests cover fetching, SSRF guards and parsing).
 */
test.use({ timezoneId: 'Europe/Paris' });

// Monday 28 September 2026 09:00 in Paris (UTC+2): the beginner profile trains Monday 17:10.
const MONDAY = new Date('2026-09-28T07:00:00Z');
// An evening job, Monday to Friday 17:00–22:00 Paris time (busy ranges only: no title exists).
const EVENINGS = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'].map((d) => ({
  start: `${d}T15:00:00.000Z`,
  end: `${d}T20:00:00.000Z`,
  allDay: false,
}));
const LINK = 'webcal://edt.example.fr/export/cours-secret-token.ics';

async function setup(page: Page) {
  const state: MockState = { feed: null, calls: [], busy: EVENINGS };
  await mockAccount(page, state);
  await seedProfile(page, SCENARIOS.beginner);
  await page.clock.setFixedTime(MONDAY);
  return state;
}

const mondaySession = (page: Page) => page.getByText('17:10–17:55').filter({ visible: true });

test('paste, test, use: sessions avoid the busy times; switch off; delete', async ({ page }) => {
  const errors = collectErrors(page);
  const state = await setup(page);

  await page.goto('/program');
  await expect(mondaySession(page).first()).toBeVisible();

  await page.goto('/calendar');
  await expect(text(page, 'Ajouter un calendrier iCal')).toBeVisible();
  await expect(
    text(
      page,
      'Colle le lien iCal de ton planning scolaire, professionnel ou personnel. PROJECT YOU lit uniquement les créneaux occupés pour mieux placer tes séances.',
    ),
  ).toBeVisible();
  await expect(text(page, /Les titres et détails de tes événements ne sont pas utilisés par le coach/)).toBeVisible();
  // No dead button on the web: the device calendar is one line, availability stays editable.
  await expect(page.getByRole('button', { name: 'Connecter mon calendrier' })).toHaveCount(0);
  await expect(button(page, 'Modifier mes disponibilités')).toBeEnabled();

  await field(page, 'Lien iCal (https ou webcal)').fill(LINK);
  await button(page, 'Tester le lien').click();
  await expect(text(page, 'Calendrier trouvé : edt.example.fr')).toBeVisible();
  await expect(text(page, '5 événement(s) dans les 6 prochaines semaines.')).toBeVisible();
  expect(state.feed).toBeNull(); // a test stores nothing

  await button(page, 'Utiliser ce calendrier').click();
  await expect(text(page, /Actualisé le .* : 5 événement\(s\) sur 6 semaines\./)).toBeVisible();
  await expect(page.getByRole('switch', { name: /Tenir compte de ce calendrier/ })).toBeChecked();
  expect(state.feed?.enabled).toBe(true);
  expect(state.calls.map((c) => c.action)).toEqual(['test', 'save']);
  expect(state.calls[0]).toMatchObject({ url: LINK, timeZone: 'Europe/Paris' });

  // The device keeps busy times only: neither the link (it holds a token) nor any title.
  const cached = await page.evaluate(() => localStorage.getItem('py.calendarFeed.v1') ?? '');
  expect(cached).toContain('2026-09-28T15:00:00.000Z');
  expect(cached).not.toContain('secret-token');
  expect(cached).not.toMatch(/summary|title|description|location/i);

  // Planning: Monday evening is busy, the session moves out of it.
  await page.goto('/program');
  await expect(text(page, 'Ton programme')).toBeVisible();
  await expect(mondaySession(page)).toHaveCount(0);

  // Refresh.
  await page.goto('/calendar');
  await button(page, 'Actualiser').click();
  await expect.poll(() => state.calls.map((c) => c.action)).toEqual(['test', 'save', 'refresh']);

  // Switched off: the plan comes back to the manual availability only.
  await page.getByRole('switch', { name: /Tenir compte de ce calendrier/ }).click();
  await expect.poll(() => state.feed?.enabled).toBe(false);
  await page.goto('/program');
  await expect(mondaySession(page).first()).toBeVisible();

  // Delete: the row and the busy times are gone, the form is back.
  await page.goto('/calendar');
  await button(page, 'Supprimer ce calendrier').click();
  await expect(text(page, /Le lien et les créneaux occupés lus seront supprimés/)).toBeVisible();
  await button(page, 'Confirmer').click();
  await expect(button(page, 'Tester le lien')).toBeVisible();
  expect(state.feed).toBeNull();
  const after = await page.evaluate(() => localStorage.getItem('py.calendarFeed.v1') ?? '');
  expect(after).not.toContain('2026-09-28T15:00:00.000Z');

  expect(errors).toEqual([]);
});

test('each problem with a link is said plainly, and nothing is kept', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/calendar');
  const url = field(page, 'Lien iCal (https ou webcal)');

  await url.fill('http://edt.example.fr/cours.ics');
  await button(page, 'Tester le lien').click();
  await expect(text(page, 'Seuls les liens sécurisés (https ou webcal) sont acceptés.')).toBeVisible();

  await url.fill('https://192.168.1.10/cal.ics');
  await button(page, 'Tester le lien').click();
  await expect(text(page, /adresse privée ou locale/)).toBeVisible();

  await url.fill('https://edt.example.fr/expired.ics');
  await button(page, 'Tester le lien').click();
  await expect(text(page, /Le calendrier refuse l’accès/)).toBeVisible();

  await url.fill('https://edt.example.fr/login');
  await button(page, 'Tester le lien').click();
  await expect(text(page, /ne renvoie pas un calendrier iCal/)).toBeVisible();

  expect(state.feed).toBeNull();
  // Manual availability stays reachable whatever happens to the link.
  await button(page, 'Modifier mes disponibilités').click();
  await expect(page).toHaveURL(/\/settings\/schedule$/);
});

// Classes Monday to Friday, 08:00–12:00 and 14:00–17:00 Paris time (UTC+2): busy ranges only.
const CLASSES = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'].flatMap((d) => [
  { start: `${d}T06:00:00.000Z`, end: `${d}T10:00:00.000Z`, allDay: false },
  { start: `${d}T12:00:00.000Z`, end: `${d}T15:00:00.000Z`, allDay: false },
]);
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

test('no availability entered: the calendar gives real times between the events (D-050)', async ({ page }) => {
  const errors = collectErrors(page);
  const state: MockState = { feed: null, calls: [], busy: CLASSES };
  await mockAccount(page, state);
  await seedProfile(page, scenario({ schedule: { availability: [], fixedConstraints: [] } }));
  await page.clock.setFixedTime(MONDAY);

  // Before: days only, no hour is invented.
  await page.goto('/program');
  await expect(text(page, 'Ton programme')).toBeVisible();
  await expect(page.getByText(/^\d{2}:\d{2} · /).filter({ visible: true })).toHaveCount(0);

  await page.goto('/calendar');
  await field(page, 'Lien iCal (https ou webcal)').fill(LINK);
  await button(page, 'Tester le lien').click();
  await button(page, 'Utiliser ce calendrier').click();
  await expect(text(page, 'PROJECT YOU utilise les créneaux libres entre tes événements pour placer tes séances.')).toBeVisible();
  await expect(text(page, 'Cette semaine : 3 séances placées entre tes événements.')).toBeVisible();

  // Programme: each session has a start time, at the gym, outside the classes with its travel.
  await page.goto('/program');
  const lines = page.getByText(/^\d{2}:\d{2} · .+ · Salle$/).filter({ visible: true });
  await expect(lines.first()).toBeVisible();
  for (const line of await lines.allTextContents()) {
    const start = minutes(line);
    expect(start - 10).toBeGreaterThanOrEqual(minutes('07:00'));
    // Weekdays: 12:00–14:00 or after 17:00 (60 min + 10 min travel each way).
    const lunch = start >= minutes('12:10') && start + 70 <= minutes('14:00');
    const evening = start >= minutes('17:10') && start + 70 <= minutes('22:00');
    expect(lunch || evening).toBe(true);
  }
  expect(errors).toEqual([]);
});
