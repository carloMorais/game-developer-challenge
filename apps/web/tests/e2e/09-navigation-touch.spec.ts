import { expect, test } from './support/fixtures';
import { advance, gameState, openApp, startMatch } from './support/app';

test.describe('9. Abandoning, repeated navigation and touch controls', () => {
  test('leaving a battle from the pause menu abandons it without a record', async ({ page }) => {
    await openApp(page, { noSpawns: true });
    await startMatch(page);
    await advance(page, 5000);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Main menu' }).click();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);

    await page.getByRole('button', { name: 'Match history' }).click();
    await expect(page.getByText('No battles recorded yet')).toBeVisible();
  });

  test('reloading during a battle ends it and returns to the menu', async ({ page }) => {
    await openApp(page, { noSpawns: true });
    await startMatch(page);
    await advance(page, 3000);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    await page.goto(page.url().replace(/#.*$/, '#/log/history'));
    await expect(page.getByText('No battles recorded yet')).toBeVisible();
  });

  test('the browser back button leaves the battle', async ({ page }) => {
    await openApp(page, { noSpawns: true });
    await startMatch(page);
    await page.goBack();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
  });

  test('repeated menu ↔ battle navigation leaves no stale canvas or state', async ({ page }) => {
    await openApp(page, { noSpawns: true });
    for (let i = 0; i < 4; i++) {
      await startMatch(page);
      await expect(page.locator('canvas')).toHaveCount(1);
      const state = await gameState(page);
      expect(state.tick).toBe(0);
      await advance(page, 500);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Main menu' }).click();
      await expect(page.locator('canvas')).toHaveCount(0);
      await page.getByRole('button', { name: 'Options' }).click();
      await page.getByRole('button', { name: 'Main menu' }).click();
    }
  });

  test('keyboard gameplay keys are ignored outside the battle', async ({ page }) => {
    await openApp(page, { test: false });
    await page.getByRole('button', { name: 'Options' }).focus();
    await page.keyboard.press('Space');
    // Space activated the focused button (default behaviour was not captured).
    await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible();
  });
});

test.describe('9b. Touch controls @mobile', () => {
  const press = async (
    page: import('@playwright/test').Page,
    label: string,
    pointerId: number,
    type: 'pointerdown' | 'pointerup',
  ) => {
    await page.getByRole('button', { name: label }).dispatchEvent(type, {
      pointerId,
      pointerType: 'touch',
      isPrimary: pointerId === 1,
      button: 0,
    });
  };

  test('touch buttons sail, turn and fire, several at once', async ({ page }) => {
    await openApp(page, { noSpawns: true });
    await startMatch(page);
    await expect(page.getByTestId('touch-controls')).toBeVisible();

    const before = (await gameState(page)).player!;
    await press(page, 'Sail forward', 1, 'pointerdown');
    await press(page, 'Turn right', 2, 'pointerdown');
    await press(page, 'Fire bow cannon', 3, 'pointerdown');
    await advance(page, 1000);
    await press(page, 'Sail forward', 1, 'pointerup');
    await press(page, 'Turn right', 2, 'pointerup');
    await press(page, 'Fire bow cannon', 3, 'pointerup');

    const after = await gameState(page);
    expect(Math.hypot(after.player!.x - before.x, after.player!.y - before.y)).toBeGreaterThan(40);
    expect(after.player!.angle).toBeGreaterThan(before.angle + 1);
    expect(after.stats.shots.front).toBeGreaterThan(1);

    // Released: no more input.
    const shots = after.stats.shots.front;
    await advance(page, 1000);
    expect((await gameState(page)).stats.shots.front).toBe(shots);
  });

  test('broadside buttons fire to each side', async ({ page }) => {
    await openApp(page, { noSpawns: true });
    await startMatch(page);
    await press(page, 'Fire port broadside', 1, 'pointerdown');
    await advance(page, 50);
    await press(page, 'Fire port broadside', 1, 'pointerup');
    await press(page, 'Fire starboard broadside', 2, 'pointerdown');
    await advance(page, 50);
    await press(page, 'Fire starboard broadside', 2, 'pointerup');
    const { stats } = await gameState(page);
    expect(stats.shots.port).toBe(1);
    expect(stats.shots.starboard).toBe(1);
  });

  test('the arena and HUD fit the landscape screen', async ({ page }) => {
    await openApp(page, { noSpawns: true });
    await startMatch(page);
    const viewport = page.viewportSize()!;
    for (const testId of ['hud-health', 'hud-score', 'hud-time', 'touch-controls']) {
      const box = (await page.getByTestId(testId).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    }
  });
});
