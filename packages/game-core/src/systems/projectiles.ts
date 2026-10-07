import { circleHitsIsland } from '../arena';
import { pointSegmentDistanceSq } from '../math';
import type { Projectile, ProjectileEndCause, Ship, World } from '../world';
import { damageShip, forEachHullCircle, isAlive, isRunning } from './shared';

/**
 * Moves projectiles and resolves their end: hitting an opposing ship (damage
 * applied exactly once), hitting an island, leaving the arena or running out of
 * range. A projectile is removed the same tick it ends.
 */
export function projectileSystem(world: World, dt: number): void {
  const survivors: Projectile[] = [];

  for (const projectile of world.projectiles) {
    const cause = isRunning(world) ? advance(world, projectile, dt) : null;
    if (cause) {
      world.events.push({
        type: 'projectileEnded',
        tick: world.tick,
        projectileId: projectile.id,
        cause,
        x: projectile.x,
        y: projectile.y,
      });
    } else {
      survivors.push(projectile);
    }
  }

  world.projectiles = survivors;
}

function advance(world: World, p: Projectile, dt: number): ProjectileEndCause | null {
  p.prevX = p.x;
  p.prevY = p.y;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.remainingRange -= Math.hypot(p.vx, p.vy) * dt;

  const target = firstShipHit(world, p);
  if (target) {
    damageShip(world, target, p.damage, 'projectile', p.team);
    return 'hit';
  }
  if (circleHitsIsland(world.arena, p.x, p.y, p.radius)) return 'island';
  const { width, height } = world.arena;
  if (p.x < 0 || p.y < 0 || p.x > width || p.y > height) return 'outOfBounds';
  if (p.remainingRange <= 0) return 'expired';
  return null;
}

/** Swept test (previous -> current position) so fast shots never tunnel. */
function firstShipHit(world: World, p: Projectile): Ship | null {
  let best: Ship | null = null;
  let bestDistSq = Infinity;
  for (const ship of world.ships) {
    if (ship.team === p.team || !isAlive(ship)) continue;
    forEachHullCircle(world, ship, (cx, cy, radius) => {
      const reach = radius + p.radius;
      if (pointSegmentDistanceSq(cx, cy, p.prevX, p.prevY, p.x, p.y) > reach * reach) return;
      // Prefer the ship closest to where the shot started this tick.
      const fromStart = (cx - p.prevX) ** 2 + (cy - p.prevY) ** 2;
      if (fromStart < bestDistSq) {
        bestDistSq = fromStart;
        best = ship;
      }
    });
  }
  return best;
}

/**
 * Destroyed ships stop dealing damage: their in-flight projectiles are removed.
 */
export function removeOrphanProjectiles(world: World): void {
  const deadOwners = new Set(world.ships.filter((s) => !isAlive(s)).map((s) => s.id));
  if (deadOwners.size === 0) return;
  world.projectiles = world.projectiles.filter((p) => {
    if (!deadOwners.has(p.ownerShipId)) return true;
    world.events.push({
      type: 'projectileEnded',
      tick: world.tick,
      projectileId: p.id,
      cause: 'expired',
      x: p.x,
      y: p.y,
    });
    return false;
  });
}
