import { clamp, wrapAngle } from '../math';
import type { World } from '../world';
import { isAlive } from './shared';

/** Integrates heading and forward speed from each ship's intents. */
export function movementSystem(world: World, dt: number): void {
  for (const ship of world.ships) {
    ship.prevX = ship.x;
    ship.prevY = ship.y;
    ship.prevAngle = ship.angle;
    if (!isAlive(ship)) continue;

    const { maxSpeed, acceleration, deceleration, turnRate } = world.config[ship.kind].movement;
    const throttle = clamp(ship.intents.throttle, 0, 1);
    const turn = clamp(ship.intents.turn, -1, 1);

    ship.angle = wrapAngle(ship.angle + turn * turnRate * dt);

    const target = throttle * maxSpeed;
    ship.speed =
      ship.speed < target
        ? Math.min(target, ship.speed + acceleration * dt)
        : Math.max(target, ship.speed - deceleration * dt);

    ship.x += Math.cos(ship.angle) * ship.speed * dt;
    ship.y += Math.sin(ship.angle) * ship.speed * dt;
  }
}
