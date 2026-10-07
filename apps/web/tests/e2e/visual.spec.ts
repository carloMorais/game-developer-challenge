import { expect, test } from './support/fixtures';
import { advance, openApp, startMatch } from './support/app';

const RESULT = {
  matchId: 'visual-result-0001',
  playerId: 'e2e-player-0001',
  playerName: 'Captain Test',
  score: 24,
  durationMs: 120_000,
  endReason: 'timeUp',
  endedAt: '2026-10-07T12:00:00.000Z',
  options: { sessionTime: 120, spawnInterval: 3 },
  seed: 7,
};

test.describe('Visual regression', () => {
  test('main menu', async ({ page }) => {
    await openApp(page, { test: false });
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await page.mouse.move(0, 0);
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('menu.png', { fullPage: true });
  });

  test('arena in a stable state', async ({ page }) => {
    await openApp(page, { seed: 7 });
    await startMatch(page);
    // Deterministic: seeded spawns, manual clock, seeded effects.
    await advance(page, 2500);
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('arena.png');
  });

  test('result screen', async ({ page }) => {
    await page.addInitScript((result) => {
      localStorage.setItem('pirate-battle:last-result:v1', JSON.stringify(result));
    }, RESULT);
    await openApp(page, { test: false, route: '#/result' });
    await expect(page.getByTestId('result-score')).toContainText('24');
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('result.png', { fullPage: true });
  });
});
