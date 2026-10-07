import { circleVsRoundedRect } from '../arena';
import type { Ship, World } from '../world';
import { damageShip, destroyShip, forEachHullCircle, isAlive, isRunning } from './shared';

const RESOLVE_ITERATIONS = 3;
/** Fraction of speed kept when ramming an obstacle head-on (1 = no loss). */
const HEAD_ON_SPEED_KEEP = 0.2;

/**
 * Resolves ship collisions:
 * 1. chaser vs player: the chaser explodes and damages the player (no score);
 * 2. other ship pairs are pushed apart;
 * 3. hulls are pushed out of islands and kept inside the arena.
 * Islands and bounds run last so separation can never push a ship into them.
 */
export function collisionSystem(world: World): void {
  shipVsShip(world);
  for (const ship of world.ships) {
    if (isAlive(ship)) resolveStatic(world, ship);
  }
}

function shipVsShip(world: World): void {
  const ships = world.ships;
  for (let i = 0; i < ships.length; i++) {
    const a = ships[i]!;
    for (let j = i + 1; j < ships.length; j++) {
      const b = ships[j]!;
      if (!isAlive(a) || !isAlive(b) || !isRunning(world)) continue;

      const contact = deepestContact(world, a, b);
      if (!contact) continue;

      const chaser = a.kind === 'chaser' ? a : b.kind === 'chaser' ? b : null;
      const other = chaser === a ? b : a;
      if (chaser && other.team === 'player') {
        destroyShip(world, chaser, 'impact');
        damageShip(world, other, world.config.chaser.impactDamage, 'impact', 'enemy');
        continue;
      }

      const half = contact.depth / 2;
      a.x -= contact.nx * half;
      a.y -= contact.ny * half;
      b.x += contact.nx * half;
      b.y += contact.ny * half;
    }
  }
}

/** Deepest overlap between two hulls; the normal points from `a` to `b`. */
function deepestContact(
  world: World,
  a: Ship,
  b: Ship,
): { nx: number; ny: number; depth: number } | null {
  let best: { nx: number; ny: number; depth: number } | null = null;
  forEachHullCircle(world, a, (ax, ay, ar) => {
    forEachHullCircle(world, b, (bx, by, br) => {
      const dx = bx - ax;
      const dy = by - ay;
      const reach = ar + br;
      const distSq = dx * dx + dy * dy;
      if (distSq >= reach * reach) return;
      const dist = Math.sqrt(distSq);
      const depth = reach - dist;
      if (best && depth <= best.depth) return;
      // Coincident centres: push along an arbitrary but deterministic axis.
      best = dist > 1e-6 ? { nx: dx / dist, ny: dy / dist, depth } : { nx: 1, ny: 0, depth };
    });
  });
  return best;
}

function resolveStatic(world: World, ship: Ship): void {
  const { arena } = world;
  for (let iteration = 0; iteration < RESOLVE_ITERATIONS; iteration++) {
    let pushX = 0;
    let pushY = 0;
    let deepest = 0;
    let normalX = 0;
    let normalY = 0;

    forEachHullCircle(world, ship, (cx, cy, radius) => {
      const consider = (nx: number, ny: number, depth: number) => {
        if (depth <= deepest) return;
        deepest = depth;
        normalX = nx;
        normalY = ny;
        pushX = nx * depth;
        pushY = ny * depth;
      };

      for (const island of arena.islands) {
        const hit = circleVsRoundedRect(cx, cy, radius, island.collider);
        if (hit) consider(hit.nx, hit.ny, hit.depth);
      }
      if (cx - radius < 0) consider(1, 0, radius - cx);
      if (cx + radius > arena.width) consider(-1, 0, cx + radius - arena.width);
      if (cy - radius < 0) consider(0, 1, radius - cy);
      if (cy + radius > arena.height) consider(0, -1, cy + radius - arena.height);
    });

    if (deepest === 0) return;
    ship.x += pushX;
    ship.y += pushY;

    // Lose speed in proportion to how directly the ship drove into the obstacle,
    // so grazing contacts slide while head-on contacts stop.
    const into = -(Math.cos(ship.angle) * normalX + Math.sin(ship.angle) * normalY);
    if (into > 0) ship.speed *= 1 - into * (1 - HEAD_ON_SPEED_KEEP);
  }
}
