import { expect, test } from '@playwright/test';

test('app boots without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Pirate Battle' })).toBeVisible();
  expect(errors).toEqual([]);
});
