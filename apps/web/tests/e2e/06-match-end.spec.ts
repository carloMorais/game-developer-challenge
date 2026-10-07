import { expect, test } from './support/fixtures';
import { advance, advanceUntil, gameState, openApp, startMatch } from './support/app';

test.describe('6. Ending by time or death, stopping the simulation and clean restart', () => {
  test('ends when time runs out and stops everything', async ({ page }) => {
    // No spawns: this checks the time-up path; spawn freezing is covered below.
    await openApp(page, { noSpawns: true, settings: { sessionTime: 60, spawnInterval: 3 } });
    await startMatch(page);

    await page.keyboard.down('KeyW');
    await page.keyboard.down('Space');
    await advance(page, 60_000);
    const ended = await gameState(page);
    expect(ended.status).toBe('ended');
    expect(ended.endReason).toBe('timeUp');
    expect(ended.elapsedMs).toBe(60_000);

    // Movement, attacks, damage, spawns and scoring are frozen.
    await advance(page, 3000);
    const later = await gameState(page);
    await page.keyboard.up('Space');
    await page.keyboard.up('KeyW');
    expect(later.tick).toBe(ended.tick);
    expect(later.player).toEqual(ended.player);
    expect(later.enemies).toEqual(ended.enemies);
    expect(later.score).toBe(ended.score);
    expect(later.stats).toEqual(ended.stats);

    await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible();
    await expect(page.getByTestId('result-reason')).toHaveText('Time up');
    await expect(page.getByTestId('result-duration')).toHaveText('01:00');
  });

  test('ends when the player ship sinks', async ({ page }) => {
    await openApp(page, { settings: { sessionTime: 180, spawnInterval: 1 } });
    await startMatch(page);
    const ended = await advanceUntil(page, (s) => s.status === 'ended', {
      stepMs: 2000,
      maxMs: 180_000,
    });
    expect(ended.endReason).toBe('destroyed');
    expect(ended.player).toBeNull();
    expect(ended.elapsedMs).toBeLessThan(180_000);

    // Spawns, movement and damage stop once the player has sunk.
    await advance(page, 5000);
    const later = await gameState(page);
    expect(later.tick).toBe(ended.tick);
    expect(later.stats).toEqual(ended.stats);
    expect(later.enemies).toEqual(ended.enemies);

    await expect(page.getByRole('heading', { name: 'Your ship sank' })).toBeVisible();
    await expect(page.getByTestId('result-reason')).toHaveText('Sunk');
  });

  test('Play again starts a fresh match', async ({ page }) => {
    await openApp(page, { settings: { sessionTime: 60, spawnInterval: 1 } });
    await startMatch(page);
    await advance(page, 60_000);
    await page.getByRole('button', { name: 'Play again' }).click();
    await expect(page.getByTestId('hud-score')).toBeVisible();
    await page.waitForFunction(() => (window as { __pirate?: unknown }).__pirate !== undefined);

    const fresh = await gameState(page);
    expect(fresh.status).toBe('running');
    expect(fresh.tick).toBe(0);
    expect(fresh.elapsedMs).toBe(0);
    expect(fresh.score).toBe(0);
    expect(fresh.player?.hp).toBe(fresh.player?.maxHp);
    expect(fresh.enemies).toHaveLength(0);
    expect(fresh.projectiles).toHaveLength(0);
    expect(fresh.stats.kills).toBe(0);
    await expect(page.locator('canvas')).toHaveCount(1);
  });
});
