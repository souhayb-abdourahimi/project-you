import { expect, test } from '@playwright/test';

import { SCENARIOS } from '../src/domain/scenarios';

import { button, collectErrors, freezeClock, seedProfile, text } from './helpers';

test.beforeEach(async ({ page }) => {
  await freezeClock(page);
});

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const GYMS = {
  elements: [
    {
      type: 'node',
      id: 1,
      lat: 48.858,
      lon: 2.355,
      tags: { leisure: 'fitness_centre', name: 'Salle Rivoli (fixture)', opening_hours: 'Mo-Fr 06:00-22:00' },
    },
    { type: 'node', id: 2, lat: 48.86, lon: 2.36, tags: { leisure: 'fitness_centre', name: 'Club Est (fixture)' } },
  ],
};

test.describe('nearby places', () => {
  test.use({ geolocation: { latitude: 48.85661, longitude: 2.35222 }, permissions: ['geolocation'] });

  test('lists OSM gyms with their source, never invents missing data, keeps the chosen gym', async ({ page }) => {
    let sentBody = '';
    await page.route(OVERPASS, async (route) => {
      sentBody = decodeURIComponent(route.request().postData() ?? '');
      await route.fulfill({ json: GYMS });
    });
    await seedProfile(page, SCENARIOS.noGym);
    await page.goto('/places');
    await button(page, 'Chercher autour de moi').click();

    await expect(text(page, 'Salle Rivoli (fixture)')).toBeVisible();
    await expect(text(page, /Horaires indiqués sur OpenStreetMap \(à vérifier\) : Mo-Fr 06:00-22:00/)).toBeVisible();
    await expect(text(page, 'Horaires : donnée indisponible')).toBeVisible();
    await expect(text(page, /à vol d’oiseau/)).toBeVisible();
    await expect(text(page, /Source : OpenStreetMap/)).toBeVisible();
    // The exact position never leaves the device.
    expect(sentBody).toContain('48.857,2.352');
    expect(sentBody).not.toContain('48.85661');

    await button(page, 'C’est ma salle').click();
    await expect(text(page, /Ta salle : Salle Rivoli \(fixture\)/)).toBeVisible();
  });

  test('says data is unavailable when OSM has nothing', async ({ page }) => {
    await page.route(OVERPASS, (route) => route.fulfill({ json: { elements: [] } }));
    await seedProfile(page, SCENARIOS.beginner);
    await page.goto('/places');
    await button(page, 'Chercher autour de moi').click();
    await expect(text(page, /Donnée indisponible : aucun lieu trouvé/)).toBeVisible();
  });
});

test('location refused: the app stays usable and explains why', async ({ page, context }) => {
  await context.clearPermissions();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (_ok: unknown, fail: (e: { code: number; message: string }) => void) =>
          fail({ code: 1, message: 'denied' }),
        watchPosition: () => 0,
        clearWatch: () => undefined,
      },
    });
  });
  await seedProfile(page, SCENARIOS.beginner);
  await page.goto('/places');
  await button(page, 'Chercher autour de moi').click();
  await expect(text(page, /Position (refusée|indisponible)/)).toBeVisible();
});

test('calendar on the web says it is unsupported instead of failing', async ({ page }) => {
  await seedProfile(page, SCENARIOS.beginner);
  await page.goto('/calendar');
  await expect(text(page, /n’est pas disponible sur le web/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connecter mon calendrier' }).filter({ visible: true })).toBeDisabled();
});

test('health on the web: clear message, manual entry still available, nothing on Today', async ({ page }) => {
  const errors = collectErrors(page);
  await seedProfile(page, SCENARIOS.beginner);
  await page.goto('/health');
  await expect(text(page, 'Les données santé ne sont pas disponibles sur cette plateforme.')).toBeVisible();
  await button(page, 'Saisir à la main').click();
  await expect(page).toHaveURL(/\/progress$/);
  await expect(button(page, 'Noter mon poids')).toBeVisible();

  await page.goto('/privacy');
  await expect(text(page, 'Santé et activité')).toBeVisible();
  await expect(text(page, /jamais envoyées à ton compte ni à l’IA/)).toBeVisible();

  await page.goto('/');
  await expect(text(page, 'Pas aujourd’hui')).toHaveCount(0);
  expect(errors).toEqual([]);
});
