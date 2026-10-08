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
  difficulty: 'normal',
  options: { sessionTime: 120, spawnInterval: 3 },
  seed: 7,
  grade: 'A',
  stats: { kills: { chaser: 14, shooter: 10 }, shotsFired: 80, hits: 52 },
  hp: 64,
  maxHp: 100,
  unlocked: 'challenging',
};

test.describe('Visual regression', () => {
  test('main menu', async ({ page }) => {
    await openApp(page, { test: false });
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await page.mouse.move(0, 0);
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('menu.png', { fullPage: true });
  });

  test('difficulty setup', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'pirate-battle:progress:v1',
        JSON.stringify({ unlockedIndex: 1, best: { easy: 'A+' } }),
      );
    });
    await openApp(page, { test: false, route: '#/setup', settings: { difficulty: 'easy' } });
    await expect(page.getByRole('button', { name: 'Set sail' })).toBeVisible();
    await page.mouse.move(0, 0);
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('setup.png', { fullPage: true });
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
      localStorage.setItem('pirate-battle:last-result:v2', JSON.stringify(result));
    }, RESULT);
    await openApp(page, { test: false, route: '#/result' });
    await expect(page.getByTestId('result-score')).toContainText('24');
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('result.png', { fullPage: true });
  });
});
