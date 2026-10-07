import { expect, test } from './support/fixtures';
import { advance, gameState, holdKeys, openApp, startMatch } from './support/app';

// The default arena's grass island collider (tiles 13..16 x 6..9, inset 10).
const ISLAND = { x: 842, y: 394, w: 236, h: 236 };

test.describe('3. Start, movement, rotation, arena limits and islands', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, { noSpawns: true });
    await startMatch(page);
  });

  test('starts a match with full health, zero score and the full clock', async ({ page }) => {
    const state = await gameState(page);
    expect(state.status).toBe('running');
    expect(state.player?.hp).toBe(state.player?.maxHp);
    expect(state.score).toBe(0);
    expect(state.remainingMs).toBe(120_000);
    await expect(page.getByTestId('hud-time')).toContainText('02:00');
  });

  test('sails forward along the heading', async ({ page }) => {
    const before = (await gameState(page)).player!;
    await holdKeys(page, ['KeyW'], 1000);
    const after = (await gameState(page)).player!;
    // Starts facing up (negative y).
    expect(before.y - after.y).toBeGreaterThan(60);
    expect(Math.abs(after.x - before.x)).toBeLessThan(1);
    // Releasing the key coasts to a stop.
    await advance(page, 2000);
    expect((await gameState(page)).player!.speed).toBe(0);
  });

  test('rotates both ways, also with the arrow keys', async ({ page }) => {
    const start = (await gameState(page)).player!.angle;
    await holdKeys(page, ['KeyD'], 500);
    const right = (await gameState(page)).player!.angle;
    expect(right - start).toBeCloseTo(1.2, 1);
    await holdKeys(page, ['ArrowLeft'], 500);
    expect((await gameState(page)).player!.angle).toBeCloseTo(start, 1);
  });

  test('moves and turns at the same time', async ({ page }) => {
    const before = (await gameState(page)).player!;
    await holdKeys(page, ['KeyW', 'KeyD'], 1000);
    const after = (await gameState(page)).player!;
    expect(after.angle).not.toBeCloseTo(before.angle, 1);
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(50);
  });

  test('stays inside the visible arena', async ({ page }) => {
    await page.keyboard.down('KeyW');
    for (let i = 0; i < 40; i++) {
      await advance(page, 250);
      const { player, arena } = await gameState(page);
      expect(player!.hullBounds.minY).toBeGreaterThanOrEqual(-0.01);
      expect(player!.hullBounds.minX).toBeGreaterThanOrEqual(-0.01);
      expect(player!.hullBounds.maxX).toBeLessThanOrEqual(arena.width + 0.01);
    }
    await page.keyboard.up('KeyW');
    expect((await gameState(page)).player!.hullBounds.minY).toBeLessThan(2);
  });

  test('cannot sail through an island', async ({ page }) => {
    // Turn towards the island centre (from heading -90 degrees).
    const start = (await gameState(page)).player!;
    const target = Math.atan2(ISLAND.y + ISLAND.h / 2 - start.y, ISLAND.x + ISLAND.w / 2 - start.x);
    await holdKeys(page, ['KeyD'], ((target - start.angle) / 2.4) * 1000);

    await page.keyboard.down('KeyW');
    let maxPenetration = 0;
    let lastX = 0;
    for (let i = 0; i < 30; i++) {
      await advance(page, 200);
      const { player } = await gameState(page);
      maxPenetration = Math.max(maxPenetration, player!.islandPenetration);
      lastX = player!.x;
    }
    await page.keyboard.up('KeyW');

    expect(maxPenetration).toBeLessThan(0.5);
    // It reached the shore and was stopped there, outside the island.
    const { player } = await gameState(page);
    expect(player!.hullBounds.maxX).toBeGreaterThan(ISLAND.x - 40);
    expect(player!.x).toBeLessThan(ISLAND.x + 1);
    expect(Math.abs(player!.x - lastX)).toBeLessThan(5);
  });
});
