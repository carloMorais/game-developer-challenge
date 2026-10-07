import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ARENA,
  DEFAULT_MATCH_OPTIONS,
  applyCommand,
  circleHitsIsland,
  createMatchConfig,
  createWorld,
  drainEvents,
  getHudSnapshot,
  hullExtent,
  stepWorld,
  validateMatchOptions,
  type World,
} from '../src';
import {
  addEnemy,
  makeWorld,
  placePlayer,
  player,
  runFor,
  setIntents,
  testConfig,
} from './helpers';

describe('match rules', () => {
  it('ends when time runs out and freezes the simulation', () => {
    const world = makeWorld({ config: testConfig((c) => (c.match.duration = 60)) });
    setIntents(world, { throttle: 1, fireFront: true });
    runFor(world, 61);

    expect(world.status).toBe('ended');
    expect(world.endReason).toBe('timeUp');
    expect(world.elapsedMs).toBe(60_000);

    const frozen = JSON.stringify(world.ships) + JSON.stringify(world.projectiles);
    const tick = world.tick;
    runFor(world, 2);
    expect(JSON.stringify(world.ships) + JSON.stringify(world.projectiles)).toBe(frozen);
    expect(world.tick).toBe(tick);
  });

  it('ends when the player dies and stops scoring, damage and spawns', () => {
    const world = makeWorld({
      config: testConfig((c) => {
        c.player.maxHp = 20;
        c.spawn.initialDelay = 0.1;
        c.spawn.interval = 0.2;
      }),
    });
    placePlayer(world, 640, 360, 0);
    addEnemy(world, 'chaser', 640, 300, Math.PI / 2);
    runFor(world, 2);

    expect(world.status).toBe('ended');
    expect(world.endReason).toBe('destroyed');
    const shipsAtEnd = world.ships.length;
    const events = drainEvents(world);
    expect(events.filter((e) => e.type === 'matchEnded')).toHaveLength(1);

    runFor(world, 2);
    expect(world.ships.length).toBe(shipsAtEnd);
    expect(drainEvents(world)).toEqual([]);
  });

  it('ignores input after the match ended', () => {
    const world = makeWorld({ config: testConfig((c) => (c.match.duration = 60)) });
    runFor(world, 60);
    setIntents(world, { throttle: 1 });
    expect(player(world).intents.throttle).toBe(0);
  });

  it('reports HUD data', () => {
    const world = makeWorld({ config: testConfig((c) => (c.match.duration = 90)) });
    runFor(world, 10);
    const hud = getHudSnapshot(world);
    expect(hud.remainingMs).toBeCloseTo(80_000, 0);
    expect(hud.hp).toBe(hud.maxHp);
    expect(hud.status).toBe('running');
  });
});

describe('spawning', () => {
  const spawnConfig = () =>
    testConfig((c) => {
      c.spawn.initialDelay = 1;
      c.spawn.interval = 2;
      c.spawn.maxAlive = 50;
      // Keep spawned ships still so positions can be checked.
      c.chaser.movement.maxSpeed = 0;
      c.shooter.movement.maxSpeed = 0;
      c.shooter.attackRange = 0;
    });

  it('spawns on the configured interval, opening with both enemy types', () => {
    const world = makeWorld({ config: spawnConfig(), arena: DEFAULT_ARENA });
    drainEvents(world); // drop the player's own spawn event
    const spawned: string[] = [];
    runFor(world, 9.01, (w) => {
      for (const e of drainEvents(w)) if (e.type === 'shipSpawned') spawned.push(e.kind);
    });
    // t = 1, 3, 5, 7, 9
    expect(spawned).toHaveLength(5);
    expect(spawned.slice(0, 2)).toEqual(['chaser', 'shooter']);
  });

  it('spawns away from the player and clear of islands', () => {
    const world = makeWorld({ config: spawnConfig(), arena: DEFAULT_ARENA, seed: 99 });
    runFor(world, 60);
    const enemies = world.ships.filter((s) => s.team === 'enemy');
    expect(enemies.length).toBeGreaterThan(20);
    const p = player(world);
    for (const e of enemies) {
      expect(Math.hypot(e.x - p.x, e.y - p.y)).toBeGreaterThanOrEqual(
        world.config.spawn.minDistanceFromPlayer,
      );
      expect(circleHitsIsland(world.arena, e.x, e.y, hullExtent(world.config[e.kind].hull))).toBe(
        null,
      );
    }
  });

  it('respects the maximum number of live enemies', () => {
    const world = makeWorld({
      config: testConfig((c) => {
        c.spawn.initialDelay = 0.1;
        c.spawn.interval = 0.1;
        c.spawn.maxAlive = 3;
        c.chaser.movement.maxSpeed = 0;
        c.shooter.movement.maxSpeed = 0;
        c.shooter.attackRange = 0;
      }),
    });
    runFor(world, 5);
    expect(world.ships.filter((s) => s.team === 'enemy')).toHaveLength(3);
  });

  it('both enemy types appear in a default match', () => {
    const config = createMatchConfig(DEFAULT_MATCH_OPTIONS);
    const world = createWorld({ config, seed: 3 });
    const kinds = new Set<string>();
    while (world.status === 'running' && world.elapsedMs < 15_000) {
      stepWorld(world);
      for (const e of drainEvents(world)) if (e.type === 'shipSpawned') kinds.add(e.kind);
    }
    expect(kinds).toEqual(new Set(['player', 'chaser', 'shooter']));
  });
});

describe('determinism and serialization', () => {
  const play = (world: World, seconds: number) => {
    let t = 0;
    runFor(world, seconds, (w) => {
      t++;
      applyCommand(w, {
        tick: w.tick,
        shipId: w.playerId,
        intents: {
          throttle: 1,
          turn: Math.sin(t / 40),
          fireFront: t % 30 < 15,
          firePort: t % 90 < 5,
          fireStarboard: t % 70 < 5,
        },
      });
    });
  };
  const fresh = (seed: number) =>
    createWorld({ config: createMatchConfig(DEFAULT_MATCH_OPTIONS), seed, arena: DEFAULT_ARENA });

  it('same seed and inputs give the same world', () => {
    const a = fresh(42);
    const b = fresh(42);
    play(a, 30);
    play(b, 30);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('different seeds diverge', () => {
    const a = fresh(1);
    const b = fresh(2);
    play(a, 30);
    play(b, 30);
    expect(JSON.stringify(a.ships)).not.toBe(JSON.stringify(b.ships));
  });

  it('a serialized world resumes identically', () => {
    const original = fresh(7);
    play(original, 10);
    const copy = JSON.parse(JSON.stringify(original)) as World;
    play(original, 10);
    play(copy, 10);
    expect(JSON.stringify(copy)).toBe(JSON.stringify(original));
  });
});

describe('commands', () => {
  it('sanitizes intents and ignores commands for enemy ships', () => {
    const world = makeWorld();
    const enemy = addEnemy(world, 'chaser', 100, 100);
    applyCommand(world, {
      tick: 0,
      shipId: world.playerId,
      intents: { throttle: 5, turn: -9, fireFront: true, firePort: false, fireStarboard: false },
    });
    applyCommand(world, {
      tick: 0,
      shipId: enemy.id,
      intents: { throttle: 1, turn: 1, fireFront: true, firePort: true, fireStarboard: true },
    });
    expect(player(world).intents).toMatchObject({ throttle: 1, turn: -1, fireFront: true });
    expect(enemy.intents.firePort).toBe(false);
  });
});

describe('config', () => {
  it('validates session time and spawn interval limits', () => {
    expect(validateMatchOptions({ sessionTime: 60, spawnInterval: 1 })).toEqual({});
    expect(validateMatchOptions({ sessionTime: 180, spawnInterval: 15 })).toEqual({});
    expect(validateMatchOptions({ sessionTime: 59, spawnInterval: 3 }).sessionTime).toBeDefined();
    expect(validateMatchOptions({ sessionTime: 181, spawnInterval: 3 }).sessionTime).toBeDefined();
    expect(validateMatchOptions({ sessionTime: 90.5, spawnInterval: 3 }).sessionTime).toBeDefined();
    expect(validateMatchOptions({ sessionTime: 90, spawnInterval: 0 }).spawnInterval).toBeDefined();
    expect(
      validateMatchOptions({ sessionTime: 90, spawnInterval: -2 }).spawnInterval,
    ).toBeDefined();
    expect(
      validateMatchOptions({ sessionTime: 90, spawnInterval: 2.3 }).spawnInterval,
    ).toBeDefined();
    expect(
      validateMatchOptions({ sessionTime: Number.NaN, spawnInterval: Number.NaN }),
    ).toMatchObject({ sessionTime: expect.any(String), spawnInterval: expect.any(String) });
  });

  it('creates an immutable snapshot that ignores later changes', () => {
    const options = { sessionTime: 90, spawnInterval: 2.5 };
    const config = createMatchConfig(options);
    options.sessionTime = 150;
    expect(config.match.duration).toBe(90);
    expect(config.spawn.interval).toBe(2.5);
    expect(Object.isFrozen(config.player.weapons.front)).toBe(true);
  });

  it('rejects invalid options', () => {
    expect(() => createMatchConfig({ sessionTime: 10, spawnInterval: 3 })).toThrow(RangeError);
  });

  it('player start is clear of islands', () => {
    const { x, y } = DEFAULT_ARENA.playerStart;
    expect(circleHitsIsland(DEFAULT_ARENA, x, y, 200)).toBeNull();
  });
});
