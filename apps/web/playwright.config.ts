import { defineConfig, devices } from '@playwright/test';

const port = 4173;

/**
 * E2E suite against the production build (`vite build` + `vite preview`), the
 * same artefact that is deployed, including the MSW mocks.
 *
 * Tags: `@desktop` tests only run on desktop, `@mobile` only on mobile; the
 * main flows (untagged) run on both.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Capped so a local run leaves the machine usable (each worker runs a
  // software-rendered WebGL browser). Override with PW_WORKERS.
  workers: Number(process.env.PW_WORKERS) || 2,
  timeout: 60_000,
  reporter: [['html', { open: 'never' }], ['list']],
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.01 },
  },
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    timezoneId: 'UTC',
    locale: 'en-US',
  },
  projects: [
    {
      name: 'desktop-chromium',
      grepInvert: /@mobile/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
    {
      name: 'mobile-chromium',
      grepInvert: /@desktop/,
      use: { ...devices['Pixel 7 landscape'] },
    },
  ],
  webServer: {
    command: 'pnpm build && pnpm preview',
    url: `http://localhost:${port}`,
    // Always build and serve the current code (a leftover server would test a stale build).
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
