import { defineConfig, devices } from '@playwright/test';

const port = 4173;

/**
 * Performance profiling against the production build (`pnpm perf`).
 *
 * Runs one test at a time in the full Chromium build (new headless mode, the
 * `chromium` channel), which uses the machine's GPU instead of the software
 * WebGL of the headless shell. Results are written to `docs/reports/performance/`.
 */
export default defineConfig({
  testDir: './tests/perf',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 10 * 60_000,
  reporter: [
    ['html', { open: 'never', outputFolder: '../../docs/reports/performance/playwright-report' }],
    ['list'],
  ],
  outputDir: './test-results/perf',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'off',
    screenshot: 'off',
    timezoneId: 'UTC',
    locale: 'en-US',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chromium',
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
        launchOptions: { args: ['--ignore-gpu-blocklist', '--enable-precise-memory-info'] },
      },
    },
  ],
  webServer: {
    command: 'pnpm build && pnpm preview',
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
