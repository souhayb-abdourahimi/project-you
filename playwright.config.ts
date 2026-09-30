import { defineConfig, devices } from '@playwright/test';

/**
 * E2E on the production web export (`npm run build:web` first). Local mode: no Supabase needed.
 * PW_CHROMIUM_PATH points to a preinstalled Chromium when browsers are not downloaded.
 */
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

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
    launchOptions: { executablePath },
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions: { executablePath } } },
    { name: 'desktop', use: { viewport: { width: 1366, height: 900 }, launchOptions: { executablePath } } },
  ],
  webServer: { command: 'node scripts/serve-dist.mjs', port: 8765, reuseExistingServer: !process.env.CI },
});
