import { expect, test } from './support/fixtures';
import {
  advance,
  advanceUntil,
  aimAt,
  gameState,
  holdKeys,
  openApp,
  startMatch,
} from './support/app';

test.describe('4. Front and broadside fire, damage, cooldown and scoring @desktop', () => {
  test('bow cannon fires one projectile forward', async ({ page }) => {
    await openApp(page, { noSpawns: true });
    await startMatch(page);
    await holdKeys(page, ['Space'], 50);
    const { projectiles, stats } = await gameState(page);
    expect(stats.shots.front).toBe(1);
    expect(projectiles).toHaveLength(1);
    expect(projectiles[0]!.team).toBe('player');
    expect(projectiles[0]!.vy).toBeLessThan(0);
    expect(Math.abs(projectiles[0]!.vx)).toBeLessThan(1);
  });

  test('broadsides fire three parallel projectiles to each side', async ({ page }) => {
    await openApp(page, { noSpawns: true });
    await startMatch(page);

    await holdKeys(page, ['KeyQ'], 50);
    let { projectiles } = await gameState(page);
    expect(projectiles).toHaveLength(3);
    // Heading up: port is to the left (-x).
    for (const p of projectiles) expect(p.vx).toBeLessThan(0);
    expect(new Set(projectiles.map((p) => Math.round(p.vx))).size).toBe(1);

    await holdKeys(page, ['KeyE'], 50);
    ({ projectiles } = await gameState(page));
    expect(projectiles.filter((p) => p.vx > 0)).toHaveLength(3);
  });

  test('each weapon respects its cooldown while the trigger is held', async ({ page }) => {
    await openApp(page, { noSpawns: true });
    await startMatch(page);
    // 2 s held: shots at 0, 0.4, 0.8, 1.2, 1.6 s (bow) and 0, 1.3 s (broadside).
    await holdKeys(page, ['Space', 'KeyQ'], 2000);
    const { stats } = await gameState(page);
    expect(stats.shots.front).toBe(5);
    expect(stats.shots.port).toBe(2);
    expect(stats.shots.starboard).toBe(0);
  });

  test('hits damage the enemy once per projectile and a kill scores exactly one point', async ({
    page,
  }) => {
    await openApp(page, { settings: { spawnInterval: 15 } });
    await startMatch(page);

    const spawned = await advanceUntil(page, (s) => s.enemies.length > 0, { maxMs: 5000 });
    const chaser = spawned.enemies[0]!;
    expect(chaser.kind).toBe('chaser');

    // Aim and fire until the chaser sinks, re-aiming as it moves.
    const hpSeen: number[] = [chaser.hp];
    for (let i = 0; i < 40; i++) {
      await aimAt(page, chaser.id);
      await holdKeys(page, ['Space'], 100);
      const state = await gameState(page);
      const current = state.enemies.find((e) => e.id === chaser.id);
      if (!current) break;
      if (current.hp !== hpSeen.at(-1)) hpSeen.push(current.hp);
    }

    const after = await gameState(page);
    expect(after.enemies.find((e) => e.id === chaser.id)).toBeUndefined();
    expect(after.stats.kills).toBe(1);
    expect(after.score).toBe(1);
    // 40 hp, 20 damage per hit: one intermediate state, no double damage.
    expect(hpSeen).toEqual([40, 20]);
    await expect(page.getByTestId('hud-score')).toContainText('1');

    // Nothing else changes the score.
    await advance(page, 1000);
    expect((await gameState(page)).score).toBe(1);
  });
});
