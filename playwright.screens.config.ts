import { defineConfig } from '@playwright/test';

/**
 * Visual captures of the main states (W-9), not assertions: `npm run screens` after
 * `npm run build:web`. Images land in `screens/` (ignored by git) for the review.
 */
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: 'scripts/screens',
  testMatch: '*.screens.ts',
  timeout: 60_000,
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://localhost:8765', locale: 'fr-FR', launchOptions: { executablePath } },
  projects: [
    // iPhone 15 / 15 Pro proportions first, then a small iPhone, a mid Android and a desktop.
    {
      name: 'iphone15',
      use: { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    },
    {
      name: 'iphoneSE',
      use: { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    },
    {
      name: 'android',
      use: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
    },
    { name: 'desktop', use: { viewport: { width: 1366, height: 900 } } },
  ],
  webServer: { command: 'node scripts/serve-dist.mjs', port: 8765, reuseExistingServer: true },
});
