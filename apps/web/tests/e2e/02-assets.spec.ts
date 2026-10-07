import { expect, test } from './support/fixtures';
import { openApp } from './support/app';

test.describe('2. Asset loading, failures and retry', () => {
  test('shows loading progress before the battle starts', async ({ page }) => {
    // Hold one atlas back so the loading state is observable.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.context().route('**/game/atlas/tiles.png', async (route) => {
      await gate;
      await route.continue();
    });

    await openApp(page);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    const progress = page.getByTestId('loading-progress');
    await expect(progress).toBeVisible();
    await expect(page.getByText('Loading the fleet…')).toBeVisible();
    release();
    await expect(page.getByTestId('hud-score')).toBeVisible();
    await expect(progress).toBeHidden();
  });

  test.describe('failure', () => {
    // PixiJS fetches images from a worker, through the MSW service worker,
    // where Playwright routing cannot reach. These tests need no API mocks, so
    // service workers are blocked and routes see every asset request.
    test.use({ allowNetworkErrors: true, serviceWorkers: 'block' });

    test('reports a failed atlas and recovers on retry', async ({ page }) => {
      let fail = true;
      await page.route('**/game/atlas/ships.png', (route) =>
        fail ? route.abort() : route.continue(),
      );

      await openApp(page);
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('The battle assets could not be loaded.');
      await expect(page.locator('canvas')).toHaveCount(0);

      fail = false;
      await page.getByRole('button', { name: 'Try again' }).click();
      await expect(page.getByTestId('hud-score')).toBeVisible();
      await expect(page.locator('canvas')).toHaveCount(1);
    });

    test('lets the player go back to the menu after a failure', async ({ page }) => {
      await page.route('**/game/atlas/ui.json', (route) => route.abort());
      await openApp(page);
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await expect(page.getByRole('alert')).toBeVisible();
      await page.getByRole('button', { name: 'Main menu' }).click();
      await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    });
  });
});
