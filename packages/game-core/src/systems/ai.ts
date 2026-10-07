import { circleHitsIsland, segmentHitsIsland } from '../arena';
import { angleDelta, clamp } from '../math';
import type { Ship, World } from '../world';
import { IDLE_INTENTS, getPlayer } from '../world';
import { hullOf, isAlive } from './shared';

/** Candidate heading offsets tried, in order, when the direct path is blocked. */
const AVOID_OFFSETS = [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.8, -1.8, 2.4, -2.4];
/** Turn input gain: full turn when heading error exceeds 1 / gain radians. */
const TURN_GAIN = 3;

/** Writes intents for every enemy ship. Player intents come from input. */
export function aiSystem(world: World): void {
  const player = getPlayer(world);
  for (const ship of world.ships) {
    if (ship.team !== 'enemy' || !isAlive(ship)) continue;
    if (!player || !isAlive(player)) {
      ship.intents = { ...IDLE_INTENTS };
      continue;
    }
    if (ship.kind === 'chaser') chase(world, ship, player);
    else if (ship.kind === 'shooter') shoot(world, ship, player);
  }
}

function chase(world: World, ship: Ship, player: Ship): void {
  const desired = Math.atan2(player.y - ship.y, player.x - ship.x);
  const heading = steerAroundObstacles(world, ship, desired);
  ship.intents = { ...IDLE_INTENTS, throttle: 1, turn: turnTowards(ship, heading) };
}

function shoot(world: World, ship: Ship, player: Ship): void {
  const { attackRange, preferredRange, aimTolerance } = world.config.shooter;
  const dx = player.x - ship.x;
  const dy = player.y - ship.y;
  const distance = Math.hypot(dx, dy);
  const toPlayer = Math.atan2(dy, dx);
  const hasLineOfSight = !segmentHitsIsland(world.arena, ship.x, ship.y, player.x, player.y);

  if (distance > preferredRange || !hasLineOfSight) {
    // Close in (around islands) until in a good firing position.
    const heading = steerAroundObstacles(world, ship, toPlayer);
    ship.intents = { ...IDLE_INTENTS, throttle: 1, turn: turnTowards(ship, heading) };
  } else {
    // Hold position and line up the bow gun.
    ship.intents = { ...IDLE_INTENTS, throttle: 0, turn: turnTowards(ship, toPlayer) };
  }

  const aimError = Math.abs(angleDelta(ship.angle, toPlayer));
  ship.intents.fireFront = distance <= attackRange && hasLineOfSight && aimError <= aimTolerance;
}

function turnTowards(ship: Ship, heading: number): number {
  return clamp(angleDelta(ship.angle, heading) * TURN_GAIN, -1, 1);
}

/**
 * Feeler-based avoidance: probes ahead along candidate headings (closest to the
 * desired one first) and returns the first one whose path is clear of islands
 * and arena edges.
 */
function steerAroundObstacles(world: World, ship: Ship, desired: number): number {
  const hull = hullOf(world, ship);
  const lookAhead = 60 + ship.speed * 0.6;
  for (const offset of AVOID_OFFSETS) {
    const heading = desired + offset;
    if (isPathClear(world, ship, heading, lookAhead, hull.radius)) return heading;
  }
  return desired;
}

function isPathClear(
  world: World,
  ship: Ship,
  heading: number,
  distance: number,
  radius: number,
): boolean {
  const { width, height } = world.arena;
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  for (const t of [0.5, 1]) {
    const x = ship.x + cos * distance * t;
    const y = ship.y + sin * distance * t;
    if (x < radius || y < radius || x > width - radius || y > height - radius) return false;
    if (circleHitsIsland(world.arena, x, y, radius)) return false;
  }
  return true;
}
