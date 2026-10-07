import { test as base, expect } from '@playwright/test';

/**
 * Every test fails on unhandled page errors or console errors. Tests that
 * simulate HTTP failures opt into the browser's own "Failed to load resource"
 * log lines with `test.use({ allowNetworkErrors: true })`.
 */
export const test = base.extend<{ allowNetworkErrors: boolean; consoleGuard: void }>({
  allowNetworkErrors: [false, { option: true }],
  consoleGuard: [
    async ({ page, allowNetworkErrors }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (allowNetworkErrors && text.startsWith('Failed to load resource')) return;
        errors.push(`console.error: ${text}`);
      });
      await use();
      expect(errors, 'unexpected console errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
