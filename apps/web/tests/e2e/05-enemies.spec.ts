import { expect, test } from './support/fixtures';
import { advance, advanceUntil, gameState, openApp, startMatch } from './support/app';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

test.describe('5. Chaser and Shooter behaviour and spawn interval @desktop', () => {
  test('chaser pursues the player and explodes on impact without scoring', async ({ page }) => {
    await openApp(page, { settings: { spawnInterval: 15 } });
    await startMatch(page);

    const spawned = await advanceUntil(page, (s) => s.enemies.length > 0, { maxMs: 5000 });
    const chaser = spawned.enemies[0]!;
    expect(chaser.kind).toBe('chaser');
    // Spawned far enough away to avoid unavoidable damage.
    expect(dist(chaser, spawned.player!)).toBeGreaterThanOrEqual(380);

    let previous = dist(chaser, spawned.player!);
    let approaches = 0;
    const final = await advanceUntil(
      page,
      (s) => {
        const c = s.enemies.find((e) => e.id === chaser.id);
        if (!c) return true;
        const d = dist(c, s.player!);
        if (d < previous) approaches++;
        previous = d;
        return false;
      },
      { stepMs: 200, maxMs: 15_000 },
    );

    expect(approaches).toBeGreaterThan(3);
    expect(final.player!.hp).toBe(final.player!.maxHp - 20);
    expect(final.score).toBe(0);
    expect(final.stats.kills).toBe(0);
  });

  test('shooter closes in and fires only within its attack range', async ({ page }) => {
    await openApp(page, { settings: { spawnInterval: 4 } });
    await startMatch(page);

    // Opening sequence: chaser first, then a shooter.
    const withShooter = await advanceUntil(
      page,
      (s) => s.enemies.some((e) => e.kind === 'shooter'),
      {
        maxMs: 10_000,
      },
    );
    const shooter = withShooter.enemies.find((e) => e.kind === 'shooter')!;
    const startDistance = dist(shooter, withShooter.player!);

    const firing = await advanceUntil(
      page,
      (s) => s.projectiles.some((p) => p.team === 'enemy' && p.ownerShipId === shooter.id),
      { stepMs: 50, maxMs: 20_000 },
    );
    const at = firing.enemies.find((e) => e.id === shooter.id)!;
    const range = dist(at, firing.player!);
    expect(range).toBeLessThan(startDistance);
    expect(range).toBeLessThanOrEqual(380 + 5);

    // Its shot hurts the player.
    const hpBefore = firing.player!.hp;
    const hit = await advanceUntil(page, (s) => (s.player?.hp ?? 0) < hpBefore, { maxMs: 5000 });
    expect(hit.player!.hp).toBeLessThan(hpBefore);
  });

  test('enemies keep spawning on the configured interval', async ({ page }) => {
    await openApp(page, { settings: { spawnInterval: 2 } });
    await startMatch(page);
    const spawned = async () => {
      const { stats } = await gameState(page);
      return stats.spawned.chaser + stats.spawned.shooter;
    };

    // First spawn after 1.5 s, then every 2 s: 1.5, 3.5, 5.5, 7.5 ...
    await advance(page, 1400);
    expect(await spawned()).toBe(0);
    await advance(page, 200);
    expect(await spawned()).toBe(1);
    await advance(page, 2000);
    expect(await spawned()).toBe(2);
    await advance(page, 4000);
    expect(await spawned()).toBe(4);

    const { stats } = await gameState(page);
    expect(stats.spawned.chaser).toBeGreaterThan(0);
    expect(stats.spawned.shooter).toBeGreaterThan(0);
  });
});
