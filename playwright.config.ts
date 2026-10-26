import { defineConfig, devices } from '@playwright/test';

/**
 * E2E on the production web export (`npm run build:web` first). Local mode: no Supabase needed.
 * PW_CHROMIUM_PATH points to a preinstalled Chromium when browsers are not downloaded.
 *
 * - `account`: a second export built against a fake Supabase project answered by the test itself
 *   (`npm run build:web:e2e-account`, e2e/account/supabase-mock.ts): the signed-in journeys.
 * - `iphone-webkit`: the critical screens in WebKit (iPhone 15 profile). Runs when PW_WEBKIT=1
 *   (CI installs WebKit; this sandbox cannot). WebKit on Linux is not Safari on iOS (D-048).
 */
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const webkit = process.env.PW_WEBKIT === '1';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: true,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:8765',
    locale: 'fr-FR',
    trace: 'retain-on-failure',
    // The app-shell service worker is tested on its own (e2e/pwa.spec.ts); elsewhere it would only
    // add caching between specs.
    serviceWorkers: 'block',
    launchOptions: { executablePath },
  },
  projects: [
    {
      name: 'mobile',
      testIgnore: /account\//,
      use: { ...devices['Pixel 7'], launchOptions: { executablePath } },
    },
    {
      name: 'desktop',
      testIgnore: /account\//,
      use: { viewport: { width: 1366, height: 900 }, launchOptions: { executablePath } },
    },
    {
      name: 'account',
      testMatch: /account\/.*\.spec\.ts/,
      use: { ...devices['Pixel 7'], baseURL: 'http://localhost:8766', launchOptions: { executablePath } },
    },
    ...(webkit
      ? [
          {
            name: 'iphone-webkit',
            testMatch: /critical\.spec\.ts/,
            use: { ...devices['iPhone 15'] },
          },
        ]
      : []),
  ],
  webServer: [
    { command: 'node scripts/serve-dist.mjs', port: 8765, reuseExistingServer: !process.env.CI },
    {
      command: 'node scripts/serve-dist.mjs',
      env: { DIST_DIR: 'dist-account', PORT: '8766' },
      port: 8766,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
