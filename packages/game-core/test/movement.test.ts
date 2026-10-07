import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ARENA,
  FixedStepLoop,
  circleVsRoundedRect,
  forEachHullCircle,
  stepWorld,
} from '../src';
import { makeWorld, placePlayer, player, runFor, setIntents, testConfig } from './helpers';

describe('player movement', () => {
  it('moves forward along its heading and caps speed', () => {
    const world = makeWorld();
    placePlayer(world, 200, 360, 0);
    setIntents(world, { throttle: 1 });
    runFor(world, 3);

    const ship = player(world);
    const { maxSpeed } = world.config.player.movement;
    expect(ship.speed).toBeCloseTo(maxSpeed, 5);
    expect(ship.x).toBeGreaterThan(200 + maxSpeed * 2);
    expect(ship.y).toBeCloseTo(360, 5);
  });

  it('does not move without throttle', () => {
    const world = makeWorld();
    placePlayer(world, 300, 300, 0);
    runFor(world, 1);
    expect(player(world).x).toBe(300);
  });

  it('rotates both ways at the configured turn rate', () => {
    const world = makeWorld();
    const { turnRate } = world.config.player.movement;
    placePlayer(world, 640, 360, 0);

    setIntents(world, { turn: 1 });
    runFor(world, 0.5);
    expect(player(world).angle).toBeCloseTo(turnRate * 0.5, 5);

    setIntents(world, { turn: -1 });
    runFor(world, 1);
    expect(player(world).angle).toBeCloseTo(-turnRate * 0.5, 5);
  });

  it('can move and fire at the same time', () => {
    const world = makeWorld();
    placePlayer(world, 300, 360, 0);
    setIntents(world, { throttle: 1, turn: 0.5, fireFront: true });
    runFor(world, 0.2);
    expect(player(world).x).toBeGreaterThan(300);
    expect(world.projectiles.length).toBeGreaterThan(0);
  });
});

describe('fixed timestep', () => {
  it('produces identical results regardless of frame rate', () => {
    const simulate = (frameMs: () => number) => {
      const world = makeWorld();
      placePlayer(world, 200, 300, 0.3);
      setIntents(world, { throttle: 1, turn: 0.4 });
      const loop = new FixedStepLoop();
      let total = 0;
      while (total < 2000) {
        const frame = Math.min(frameMs(), 2000 - total);
        total += frame;
        loop.advance(frame, (dt) => stepWorld(world, dt));
      }
      return { x: player(world).x, y: player(world).y, tick: world.tick };
    };

    const at60 = simulate(() => 1000 / 60);
    const at30 = simulate(() => 1000 / 30);
    let i = 0;
    const jitter = simulate(() => [5, 40, 16, 23, 9][i++ % 5]!);

    expect(at30.tick).toBe(at60.tick);
    expect(jitter.tick).toBe(at60.tick);
    expect(at30.x).toBeCloseTo(at60.x, 6);
    expect(jitter.y).toBeCloseTo(at60.y, 6);
  });

  it('caps catch-up after a long frame', () => {
    const loop = new FixedStepLoop(10, 100);
    let steps = 0;
    loop.advance(5000, () => steps++);
    expect(steps).toBe(10);
  });

  it('reset drops leftover time', () => {
    const loop = new FixedStepLoop(10, 100);
    let steps = 0;
    loop.advance(9, () => steps++);
    loop.reset();
    loop.advance(9, () => steps++);
    expect(steps).toBe(0);
  });
});

describe('arena limits and islands', () => {
  it('keeps every hull circle inside the arena', () => {
    const world = makeWorld();
    placePlayer(world, 640, 360, -Math.PI / 4);
    setIntents(world, { throttle: 1, turn: 0.15 });
    runFor(world, 20, (w) => {
      forEachHullCircle(w, player(w), (x, y, r) => {
        expect(x - r).toBeGreaterThanOrEqual(-1e-6);
        expect(y - r).toBeGreaterThanOrEqual(-1e-6);
        expect(x + r).toBeLessThanOrEqual(w.arena.width + 1e-6);
        expect(y + r).toBeLessThanOrEqual(w.arena.height + 1e-6);
      });
    });
  });

  it('blocks ships from entering islands', () => {
    const world = makeWorld({ arena: DEFAULT_ARENA });
    const island = DEFAULT_ARENA.islands.find((i) => i.id === 'grass-se')!;
    const c = island.collider;
    // Start left of the island, aimed straight at it.
    placePlayer(world, c.x - 120, c.y + c.h / 2, 0);
    setIntents(world, { throttle: 1 });

    let maxDepth = 0;
    runFor(world, 6, (w) => {
      forEachHullCircle(w, player(w), (x, y, r) => {
        const hit = circleVsRoundedRect(x, y, r, c);
        if (hit) maxDepth = Math.max(maxDepth, hit.depth);
      });
    });

    expect(player(world).x).toBeLessThan(c.x);
    // Penetration is resolved within the same step; allow float slack only.
    expect(maxDepth).toBeLessThan(0.5);
  });

  it('slides along an island when grazing it', () => {
    const world = makeWorld({ arena: DEFAULT_ARENA, config: testConfig() });
    const c = DEFAULT_ARENA.islands.find((i) => i.id === 'grass-se')!.collider;
    placePlayer(world, c.x - 60, c.y + c.h / 2, -0.35);
    setIntents(world, { throttle: 1 });
    runFor(world, 4);
    // It keeps making progress instead of sticking to the wall.
    expect(player(world).speed).toBeGreaterThan(0);
    expect(player(world).y).toBeLessThan(c.y + c.h / 2);
  });
});
