import { TIME_EPSILON, clamp } from './math';
import { aiSystem } from './systems/ai';
import { collisionSystem } from './systems/collision';
import { movementSystem } from './systems/movement';
import { projectileSystem, removeOrphanProjectiles } from './systems/projectiles';
import { endMatch, isAlive, isRunning } from './systems/shared';
import { spawnSystem } from './systems/spawn';
import { weaponSystem } from './systems/weapons';
import type { InputCommand, ShipIntents, World } from './world';
import { getShip } from './world';

export const TICK_RATE = 60;
export const STEP_MS = 1000 / TICK_RATE;

/**
 * Advances the world by one fixed step. Pausing simply means not calling this:
 * timers, cooldowns, spawns and movement all derive from `dtMs`.
 */
export function stepWorld(world: World, dtMs: number = STEP_MS): void {
  if (!isRunning(world)) return;
  const dt = dtMs / 1000;
  const duration = world.config.match.duration * 1000;

  world.tick++;
  world.elapsedMs = Math.min(world.elapsedMs + dtMs, duration);

  aiSystem(world);
  movementSystem(world, dt);
  collisionSystem(world);
  weaponSystem(world, dt);
  projectileSystem(world, dt);
  removeOrphanProjectiles(world);
  world.ships = world.ships.filter(isAlive);
  spawnSystem(world, dtMs);

  if (world.elapsedMs >= duration - TIME_EPSILON) {
    world.elapsedMs = duration;
    endMatch(world, 'timeUp');
  }
}

function sanitizeIntents(intents: ShipIntents): ShipIntents {
  return {
    throttle: clamp(Number(intents.throttle) || 0, 0, 1),
    turn: clamp(Number(intents.turn) || 0, -1, 1),
    fireFront: intents.fireFront === true,
    firePort: intents.firePort === true,
    fireStarboard: intents.fireStarboard === true,
  };
}

/**
 * Applies a player's input. Intents are held until replaced, matching how
 * keys and touch controls behave. Commands for dead or enemy ships are ignored.
 */
export function applyCommand(world: World, command: InputCommand): void {
  if (!isRunning(world)) return;
  const ship = getShip(world, command.shipId);
  if (!ship || ship.team !== 'player' || !isAlive(ship)) return;
  ship.intents = sanitizeIntents(command.intents);
}
