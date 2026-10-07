import type { HullConfig } from '../config';
import { rngNext } from '../rng';
import type { DestroyCause, EndReason, Ship, Team, World } from '../world';

export function random(world: World): number {
  const [value, next] = rngNext(world.rngState);
  world.rngState = next;
  return value;
}

export function isRunning(world: World): boolean {
  return world.status === 'running';
}

export function isAlive(ship: Ship): boolean {
  return ship.hp > 0;
}

export function hullOf(world: World, ship: Ship): HullConfig {
  return world.config[ship.kind].hull;
}

/** Distance from the ship centre to the farthest point of its hull. */
export function hullExtent(hull: HullConfig): number {
  return Math.max(...hull.offsets.map(Math.abs)) + hull.radius;
}

/** Calls `fn` with the world position of every hull circle. */
export function forEachHullCircle(
  world: World,
  ship: Ship,
  fn: (x: number, y: number, radius: number) => void,
): void {
  const hull = hullOf(world, ship);
  const cos = Math.cos(ship.angle);
  const sin = Math.sin(ship.angle);
  for (const offset of hull.offsets) {
    fn(ship.x + cos * offset, ship.y + sin * offset, hull.radius);
  }
}

export function endMatch(world: World, reason: EndReason): void {
  if (!isRunning(world)) return;
  world.status = 'ended';
  world.endReason = reason;
  world.events.push({ type: 'matchEnded', tick: world.tick, reason });
}

/**
 * Applies damage once and resolves destruction, scoring and player death.
 * Only kills made by the player's weapons score.
 */
export function damageShip(
  world: World,
  ship: Ship,
  amount: number,
  cause: DestroyCause,
  byTeam: Team | null,
): void {
  if (!isRunning(world) || !isAlive(ship)) return;

  ship.hp = Math.max(0, ship.hp - amount);
  world.events.push({
    type: 'shipDamaged',
    tick: world.tick,
    shipId: ship.id,
    amount,
    hp: ship.hp,
    x: ship.x,
    y: ship.y,
  });
  if (ship.hp > 0) return;

  world.events.push({
    type: 'shipDestroyed',
    tick: world.tick,
    shipId: ship.id,
    kind: ship.kind,
    cause,
    byTeam,
    x: ship.x,
    y: ship.y,
  });

  if (ship.team === 'enemy' && byTeam === 'player' && cause === 'projectile') {
    world.score += world.config.match.pointsPerKill;
    world.events.push({ type: 'scoreChanged', tick: world.tick, score: world.score });
  }

  if (ship.id === world.playerId) endMatch(world, 'destroyed');
}

/** Removes a ship outright (e.g. a chaser exploding on impact), without scoring. */
export function destroyShip(world: World, ship: Ship, cause: DestroyCause): void {
  if (!isAlive(ship)) return;
  ship.hp = 0;
  world.events.push({
    type: 'shipDestroyed',
    tick: world.tick,
    shipId: ship.id,
    kind: ship.kind,
    cause,
    byTeam: null,
    x: ship.x,
    y: ship.y,
  });
}
