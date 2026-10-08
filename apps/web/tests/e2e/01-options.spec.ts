import { expect, test } from './support/fixtures';
import { openApp } from './support/app';

test.describe('1. Navigation, validation and persistence of options', () => {
  test('navigates to Options and back with the keyboard', async ({ page }) => {
    await openApp(page, { test: false });
    const play = page.getByRole('button', { name: 'Play', exact: true });
    await expect(play).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Options' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible();
    await page.getByRole('button', { name: 'Main menu' }).click();
    await expect(play).toBeVisible();
  });

  test('validates values with accessible errors', async ({ page }) => {
    await openApp(page, { test: false, route: '#/options' });
    const session = page.getByRole('spinbutton', { name: 'Game session time' });
    const spawn = page.getByRole('spinbutton', { name: 'Enemy spawn time' });

    await session.fill('200');
    await expect(session).toHaveAttribute('aria-invalid', 'true');
    await expect(
      page.getByText('Game session time must be between 60 and 180 seconds.'),
    ).toBeVisible();

    await spawn.fill('0');
    await expect(
      page.getByText('Enemy spawn time must be between 1 and 15 seconds.'),
    ).toBeVisible();
    await spawn.fill('2.3');
    await expect(
      page.getByText('Enemy spawn time must be a multiple of 0.5 seconds.'),
    ).toBeVisible();

    // Saving an invalid form moves focus to the first invalid field.
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(session).toBeFocused();
    await expect(page.getByText('Options saved.')).toHaveCount(0);

    await page.getByRole('textbox', { name: 'Captain name' }).fill('   ');
    await expect(page.getByText('Captain name cannot be empty.')).toBeVisible();
  });

  test('steppers respect the limits', async ({ page }) => {
    await openApp(page, { test: false, route: '#/options', settings: { sessionTime: 170 } });
    const session = page.getByRole('spinbutton', { name: 'Game session time' });
    await page.getByRole('button', { name: 'Increase game session time' }).click();
    await expect(session).toHaveValue('180');
    await page.getByRole('button', { name: 'Increase game session time' }).click();
    await expect(session).toHaveValue('180');
    await page.getByRole('button', { name: 'Decrease enemy spawn time' }).click();
    await expect(page.getByRole('spinbutton', { name: 'Enemy spawn time' })).toHaveValue('2.5');
  });

  test('saves and persists options after a refresh', async ({ page }) => {
    await openApp(page, { test: false, route: '#/options' });
    await page.getByRole('spinbutton', { name: 'Game session time' }).fill('90');
    await page.getByRole('spinbutton', { name: 'Enemy spawn time' }).fill('4.5');
    await page.getByRole('textbox', { name: 'Captain name' }).fill('Captain Persist');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Options saved.')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('spinbutton', { name: 'Game session time' })).toHaveValue('90');
    await expect(page.getByRole('spinbutton', { name: 'Enemy spawn time' })).toHaveValue('4.5');
    await expect(page.getByRole('textbox', { name: 'Captain name' })).toHaveValue(
      'Captain Persist',
    );
  });

  test('a match uses the options saved when it started', async ({ page }) => {
    await openApp(page, { settings: { sessionTime: 75, spawnInterval: 3 } });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.getByRole('button', { name: 'Set sail' }).click();
    await expect(page.getByTestId('hud-time')).toContainText('01:15');
  });
});
