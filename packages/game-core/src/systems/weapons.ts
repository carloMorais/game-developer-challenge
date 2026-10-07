import type { WeaponConfig } from '../config';
import { TIME_EPSILON } from '../math';
import type { Ship, WeaponSlot, World } from '../world';
import { isAlive, isRunning } from './shared';

const SLOTS: readonly WeaponSlot[] = ['front', 'port', 'starboard'];

/** The weapon a ship has in a slot, or null when the slot is empty. */
export function weaponFor(world: World, ship: Ship, slot: WeaponSlot): WeaponConfig | null {
  switch (ship.kind) {
    case 'player':
      return slot === 'front'
        ? world.config.player.weapons.front
        : world.config.player.weapons.broadside;
    case 'shooter':
      return slot === 'front' ? world.config.shooter.weapon : null;
    case 'chaser':
      return null;
  }
}

function wantsToFire(ship: Ship, slot: WeaponSlot): boolean {
  switch (slot) {
    case 'front':
      return ship.intents.fireFront;
    case 'port':
      return ship.intents.firePort;
    case 'starboard':
      return ship.intents.fireStarboard;
  }
}

/** Direction a slot fires in, relative to the ship's heading. */
function slotAngle(ship: Ship, slot: WeaponSlot): number {
  switch (slot) {
    case 'front':
      return ship.angle;
    case 'port':
      return ship.angle - Math.PI / 2;
    case 'starboard':
      return ship.angle + Math.PI / 2;
  }
}

/** Ticks cooldowns and fires every weapon whose trigger is held and ready. */
export function weaponSystem(world: World, dt: number): void {
  for (const ship of world.ships) {
    for (const slot of SLOTS) {
      ship.cooldowns[slot] = Math.max(0, ship.cooldowns[slot] - dt);
    }
    if (!isAlive(ship) || !isRunning(world)) continue;

    for (const slot of SLOTS) {
      const weapon = weaponFor(world, ship, slot);
      if (!weapon || !wantsToFire(ship, slot) || ship.cooldowns[slot] > TIME_EPSILON) continue;
      ship.cooldowns[slot] = weapon.cooldown;
      fire(world, ship, slot, weapon);
    }
  }
}

function fire(world: World, ship: Ship, slot: WeaponSlot, weapon: WeaponConfig): void {
  const angle = slotAngle(ship, slot);
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const headX = Math.cos(ship.angle);
  const headY = Math.sin(ship.angle);

  for (let i = 0; i < weapon.count; i++) {
    // Parallel shots are spread along the hull (the heading axis).
    const along = (i - (weapon.count - 1) / 2) * weapon.spacing;
    const x = ship.x + dirX * weapon.muzzleOffset + headX * along;
    const y = ship.y + dirY * weapon.muzzleOffset + headY * along;
    world.projectiles.push({
      id: world.nextEntityId++,
      ownerShipId: ship.id,
      team: ship.team,
      x,
      y,
      prevX: x,
      prevY: y,
      vx: dirX * weapon.projectileSpeed,
      vy: dirY * weapon.projectileSpeed,
      damage: weapon.damage,
      radius: weapon.projectileRadius,
      remainingRange: weapon.range,
    });
  }

  world.events.push({
    type: 'shotFired',
    tick: world.tick,
    shipId: ship.id,
    slot,
    x: ship.x + dirX * weapon.muzzleOffset,
    y: ship.y + dirY * weapon.muzzleOffset,
    angle,
  });
}
