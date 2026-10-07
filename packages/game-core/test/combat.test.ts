import { describe, expect, it } from 'vitest';
import { DEFAULT_ARENA, drainEvents, stepWorld, type GameEvent } from '../src';
import {
  addEnemy,
  makeWorld,
  placePlayer,
  player,
  runFor,
  setIntents,
  testConfig,
} from './helpers';

const ofType = <T extends GameEvent['type']>(events: GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

describe('weapons', () => {
  it('front gun fires one projectile along the heading', () => {
    const world = makeWorld();
    placePlayer(world, 300, 360, 0);
    setIntents(world, { fireFront: true });
    stepWorld(world);

    expect(world.projectiles).toHaveLength(1);
    const shot = world.projectiles[0]!;
    expect(shot.vx).toBeGreaterThan(0);
    expect(shot.vy).toBeCloseTo(0, 6);
    expect(shot.x).toBeGreaterThan(300);
  });

  it('respects the cooldown while the trigger is held', () => {
    const world = makeWorld();
    placePlayer(world, 100, 360, 0);
    setIntents(world, { fireFront: true });
    const shotTicks: number[] = [];
    runFor(world, 2, (w) => {
      for (const e of ofType(drainEvents(w), 'shotFired')) shotTicks.push(e.tick);
    });

    // 120 ticks; first shot on tick 1, then one every `cooldown` seconds.
    const cooldownTicks = Math.round(world.config.player.weapons.front.cooldown * 60);
    expect(shotTicks.length).toBe(Math.floor((120 - 1) / cooldownTicks) + 1);
    for (let i = 1; i < shotTicks.length; i++) {
      expect(shotTicks[i]! - shotTicks[i - 1]!).toBe(cooldownTicks);
    }
  });

  it.each([
    ['port', -1],
    ['starboard', 1],
  ] as const)('%s broadside fires three parallel projectiles', (side, sign) => {
    const world = makeWorld();
    // Heading east: port is north (-y), starboard is south (+y).
    placePlayer(world, 640, 360, 0);
    setIntents(world, side === 'port' ? { firePort: true } : { fireStarboard: true });
    stepWorld(world);

    const { count, spacing, projectileSpeed } = world.config.player.weapons.broadside;
    expect(world.projectiles).toHaveLength(count);
    for (const p of world.projectiles) {
      expect(p.vx).toBeCloseTo(0, 6);
      expect(p.vy).toBeCloseTo(sign * projectileSpeed, 6);
      expect(Math.sign(p.y - 360)).toBe(sign);
    }
    const xs = world.projectiles.map((p) => p.x).sort((a, b) => a - b);
    expect(xs[1]! - xs[0]!).toBeCloseTo(spacing, 6);
  });

  it('port and starboard have independent cooldowns', () => {
    const world = makeWorld();
    placePlayer(world, 640, 360, 0);
    setIntents(world, { firePort: true });
    stepWorld(world);
    setIntents(world, { fireStarboard: true });
    stepWorld(world);
    expect(world.projectiles).toHaveLength(6);
  });
});

describe('projectiles', () => {
  it('damages an enemy exactly once and is removed', () => {
    const world = makeWorld();
    placePlayer(world, 300, 360, 0);
    const enemy = addEnemy(world, 'shooter', 450, 360, Math.PI);
    setIntents(world, { fireFront: true });
    stepWorld(world);
    setIntents(world, {});

    const damage: number[] = [];
    runFor(world, 1, (w) => {
      for (const e of ofType(drainEvents(w), 'shipDamaged')) {
        if (e.shipId === enemy.id) damage.push(e.amount);
      }
    });

    expect(damage).toEqual([world.config.player.weapons.front.damage]);
    expect(world.projectiles.filter((p) => p.team === 'player')).toHaveLength(0);
  });

  it('awards one point per kill by the player', () => {
    const world = makeWorld({
      config: testConfig((c) => {
        c.chaser.maxHp = 10;
        c.chaser.movement.maxSpeed = 0;
      }),
    });
    placePlayer(world, 200, 360, 0);
    addEnemy(world, 'chaser', 420, 360, Math.PI);
    setIntents(world, { fireFront: true });
    runFor(world, 1.5);

    expect(world.score).toBe(1);
    expect(world.ships.filter((s) => s.team === 'enemy')).toHaveLength(0);
  });

  it('never hits ships of its own team', () => {
    const world = makeWorld();
    placePlayer(world, 100, 100, 0);
    const shooter = addEnemy(world, 'shooter', 500, 360, 0);
    const ally = addEnemy(world, 'shooter', 600, 360, Math.PI);
    // An enemy shot flying straight through an allied hull.
    world.projectiles.push({
      id: world.nextEntityId++,
      ownerShipId: shooter.id,
      team: 'enemy',
      x: 540,
      y: 360,
      prevX: 540,
      prevY: 360,
      vx: 400,
      vy: 0,
      damage: 10,
      radius: 5,
      remainingRange: 300,
    });
    runFor(world, 0.3);
    expect(ally.hp).toBe(ally.maxHp);
  });

  it('expires after its range', () => {
    const world = makeWorld();
    placePlayer(world, 100, 360, 0);
    setIntents(world, { fireFront: true });
    stepWorld(world);
    setIntents(world, {});
    const startX = ofType(drainEvents(world), 'shotFired')[0]!.x;
    let endX = 0;
    runFor(world, 2, (w) => {
      for (const e of ofType(drainEvents(w), 'projectileEnded')) endX = e.x;
    });
    const { range } = world.config.player.weapons.front;
    expect(world.projectiles).toHaveLength(0);
    expect(endX - startX).toBeGreaterThanOrEqual(range - 1);
    expect(endX - startX).toBeLessThan(range + 20);
  });

  it('is stopped by islands', () => {
    const world = makeWorld({ arena: DEFAULT_ARENA });
    const c = DEFAULT_ARENA.islands.find((i) => i.id === 'grass-se')!.collider;
    placePlayer(world, c.x - 140, c.y + c.h / 2, 0);
    setIntents(world, { fireFront: true });
    stepWorld(world);
    setIntents(world, {});
    const causes: string[] = [];
    runFor(world, 1, (w) => {
      for (const e of ofType(drainEvents(w), 'projectileEnded')) causes.push(e.cause);
    });
    expect(causes).toEqual(['island']);
  });

  it('is removed when leaving the arena', () => {
    const world = makeWorld();
    placePlayer(world, 1180, 360, 0);
    setIntents(world, { fireFront: true });
    stepWorld(world);
    setIntents(world, {});
    const causes: string[] = [];
    runFor(world, 1, (w) => {
      for (const e of ofType(drainEvents(w), 'projectileEnded')) causes.push(e.cause);
    });
    expect(causes).toEqual(['outOfBounds']);
  });
});

describe('enemies', () => {
  it('chaser pursues the player, explodes on impact and does not score', () => {
    const world = makeWorld();
    placePlayer(world, 640, 360, 0);
    const chaser = addEnemy(world, 'chaser', 640, 100, 0);

    let closest = Infinity;
    runFor(world, 6, (w) => {
      const c = w.ships.find((s) => s.id === chaser.id);
      if (c) closest = Math.min(closest, Math.hypot(c.x - 640, c.y - 360));
    });

    expect(world.ships.find((s) => s.id === chaser.id)).toBeUndefined();
    expect(player(world).hp).toBe(world.config.player.maxHp - world.config.chaser.impactDamage);
    expect(world.score).toBe(0);
    expect(closest).toBeLessThan(80);
  });

  it('shooter approaches, holds near its preferred range and fires', () => {
    const world = makeWorld();
    placePlayer(world, 200, 360, 0);
    const shooter = addEnemy(world, 'shooter', 1100, 360, Math.PI);
    const { preferredRange, attackRange } = world.config.shooter;

    let firstShotDistance: number | null = null;
    runFor(world, 10, (w) => {
      for (const e of ofType(drainEvents(w), 'shotFired')) {
        if (e.shipId === shooter.id && firstShotDistance === null) {
          firstShotDistance = Math.hypot(shooter.x - 200, shooter.y - 360);
        }
      }
    });

    const distance = Math.hypot(shooter.x - 200, shooter.y - 360);
    expect(firstShotDistance).not.toBeNull();
    expect(firstShotDistance!).toBeLessThanOrEqual(attackRange);
    expect(distance).toBeLessThanOrEqual(preferredRange + 5);
    expect(distance).toBeGreaterThan(preferredRange - 40);
    expect(player(world).hp).toBeLessThan(world.config.player.maxHp);
  });

  it('shooter does not fire when out of range', () => {
    const world = makeWorld({
      config: testConfig((c) => {
        c.shooter.movement.maxSpeed = 0;
      }),
    });
    placePlayer(world, 100, 360, 0);
    const shooter = addEnemy(world, 'shooter', 1100, 360, Math.PI);
    runFor(world, 3);
    expect(world.projectiles.filter((p) => p.ownerShipId === shooter.id)).toHaveLength(0);
  });

  it('shooter holds fire without line of sight', () => {
    const world = makeWorld({
      arena: DEFAULT_ARENA,
      config: testConfig((c) => {
        c.shooter.movement.maxSpeed = 0;
        c.shooter.attackRange = 2000;
        c.shooter.preferredRange = 2000;
      }),
    });
    const c = DEFAULT_ARENA.islands.find((i) => i.id === 'grass-se')!.collider;
    // Island between them.
    placePlayer(world, c.x - 80, c.y + c.h / 2, 0);
    const shooter = addEnemy(world, 'shooter', c.x + c.w + 80, c.y + c.h / 2, Math.PI);
    runFor(world, 3);
    expect(world.projectiles.filter((p) => p.ownerShipId === shooter.id)).toHaveLength(0);
  });

  it('enemies steer around islands instead of getting stuck', () => {
    const world = makeWorld({ arena: DEFAULT_ARENA });
    const c = DEFAULT_ARENA.islands.find((i) => i.id === 'grass-se')!.collider;
    placePlayer(world, c.x - 100, c.y + c.h / 2, 0);
    const chaser = addEnemy(world, 'chaser', c.x + c.w + 60, c.y + c.h / 2, Math.PI);
    runFor(world, 10);
    expect(world.ships.find((s) => s.id === chaser.id)).toBeUndefined();
  });

  it('destroyed enemies stop dealing damage and leave the world', () => {
    const world = makeWorld({
      config: testConfig((c) => {
        c.shooter.maxHp = 1;
        c.shooter.movement.maxSpeed = 0;
        c.shooter.attackRange = 1000;
        c.shooter.weapon.projectileSpeed = 60;
      }),
    });
    placePlayer(world, 300, 360, 0);
    const shooter = addEnemy(world, 'shooter', 700, 360, Math.PI);
    // Let the shooter fire a slow shot, then kill it.
    runFor(world, 0.2);
    expect(world.projectiles.some((p) => p.ownerShipId === shooter.id)).toBe(true);
    setIntents(world, { fireFront: true });
    runFor(world, 1.5);

    expect(world.ships.find((s) => s.id === shooter.id)).toBeUndefined();
    expect(world.projectiles.some((p) => p.ownerShipId === shooter.id)).toBe(false);
    expect(player(world).hp).toBe(world.config.player.maxHp);
  });
});
