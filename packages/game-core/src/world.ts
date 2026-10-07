import type { ArenaMap } from './arena';
import { DEFAULT_ARENA } from './arena';
import type { EnemyKind, GameConfig, ShipKind } from './config';

export type EntityId = number;
export type Team = 'player' | 'enemy';
export type WeaponSlot = 'front' | 'port' | 'starboard';

/**
 * What a ship wants to do this tick. Produced by the input layer for the
 * player and by AI for enemies. Plain data so it can be sent over a network.
 */
export interface ShipIntents {
  /** 0..1 forward throttle. Ships cannot reverse. */
  throttle: number;
  /** -1 (counter-clockwise) .. 1 (clockwise). */
  turn: number;
  fireFront: boolean;
  firePort: boolean;
  fireStarboard: boolean;
}

export const IDLE_INTENTS: Readonly<ShipIntents> = Object.freeze({
  throttle: 0,
  turn: 0,
  fireFront: false,
  firePort: false,
  fireStarboard: false,
});

/** Tick-stamped input, the unit a future network layer would transmit. */
export interface InputCommand {
  tick: number;
  shipId: EntityId;
  intents: ShipIntents;
}

export interface Ship {
  id: EntityId;
  kind: ShipKind;
  team: Team;
  /** Owning player/session id. Enemies are owned by the simulation. */
  ownerId: string;
  x: number;
  y: number;
  /** Heading in radians; forward vector is (cos, sin) in y-down world space. */
  angle: number;
  /** Previous-tick pose, for render interpolation. */
  prevX: number;
  prevY: number;
  prevAngle: number;
  speed: number;
  hp: number;
  maxHp: number;
  intents: ShipIntents;
  /** Seconds until each weapon can fire again. */
  cooldowns: Record<WeaponSlot, number>;
}

export interface Projectile {
  id: EntityId;
  ownerShipId: EntityId;
  team: Team;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  /** Distance left before the projectile expires. */
  remainingRange: number;
}

export type MatchStatus = 'running' | 'ended';
export type EndReason = 'timeUp' | 'destroyed';
export type DestroyCause = 'projectile' | 'impact';
export type ProjectileEndCause = 'hit' | 'island' | 'outOfBounds' | 'expired';

export type GameEvent =
  | { type: 'shipSpawned'; tick: number; shipId: EntityId; kind: ShipKind; x: number; y: number }
  | {
      type: 'shotFired';
      tick: number;
      shipId: EntityId;
      slot: WeaponSlot;
      x: number;
      y: number;
      angle: number;
    }
  | {
      type: 'shipDamaged';
      tick: number;
      shipId: EntityId;
      amount: number;
      hp: number;
      x: number;
      y: number;
    }
  | {
      type: 'shipDestroyed';
      tick: number;
      shipId: EntityId;
      kind: ShipKind;
      cause: DestroyCause;
      byTeam: Team | null;
      x: number;
      y: number;
    }
  | {
      type: 'projectileEnded';
      tick: number;
      projectileId: EntityId;
      cause: ProjectileEndCause;
      x: number;
      y: number;
    }
  | { type: 'scoreChanged'; tick: number; score: number }
  | { type: 'matchEnded'; tick: number; reason: EndReason };

export interface World {
  config: Readonly<GameConfig>;
  arena: ArenaMap;
  seed: number;
  rngState: number;
  tick: number;
  /** Active (unpaused) simulated time in ms. */
  elapsedMs: number;
  status: MatchStatus;
  endReason: EndReason | null;
  score: number;
  playerId: EntityId;
  ships: Ship[];
  projectiles: Projectile[];
  nextEntityId: EntityId;
  /** Spawn bookkeeping. */
  spawn: { timerMs: number; count: number };
  /** Events since the last drain; consumers call {@link drainEvents}. */
  events: GameEvent[];
}

export interface CreateWorldOptions {
  config: Readonly<GameConfig>;
  seed: number;
  ownerId?: string;
  arena?: ArenaMap;
}

export function createShip(
  world: World,
  kind: ShipKind,
  x: number,
  y: number,
  angle: number,
  ownerId: string,
): Ship {
  const maxHp = world.config[kind].maxHp;
  const ship: Ship = {
    id: world.nextEntityId++,
    kind,
    team: kind === 'player' ? 'player' : 'enemy',
    ownerId,
    x,
    y,
    angle,
    prevX: x,
    prevY: y,
    prevAngle: angle,
    speed: 0,
    hp: maxHp,
    maxHp,
    intents: { ...IDLE_INTENTS },
    cooldowns: { front: 0, port: 0, starboard: 0 },
  };
  world.ships.push(ship);
  world.events.push({ type: 'shipSpawned', tick: world.tick, shipId: ship.id, kind, x, y });
  return ship;
}

export const SIMULATION_OWNER = 'sim';

export function createWorld({
  config,
  seed,
  ownerId = 'local',
  arena = DEFAULT_ARENA,
}: CreateWorldOptions): World {
  const world: World = {
    config,
    arena,
    seed,
    rngState: seed >>> 0,
    tick: 0,
    elapsedMs: 0,
    status: 'running',
    endReason: null,
    score: 0,
    playerId: -1,
    ships: [],
    projectiles: [],
    nextEntityId: 1,
    spawn: { timerMs: config.spawn.initialDelay * 1000, count: 0 },
    events: [],
  };
  const start = arena.playerStart;
  world.playerId = createShip(world, 'player', start.x, start.y, start.angle, ownerId).id;
  return world;
}

export function getShip(world: World, id: EntityId): Ship | undefined {
  return world.ships.find((ship) => ship.id === id);
}

export function getPlayer(world: World): Ship | undefined {
  return getShip(world, world.playerId);
}

export function isEnemyKind(kind: ShipKind): kind is EnemyKind {
  return kind !== 'player';
}

/** Returns and clears pending events. */
export function drainEvents(world: World): GameEvent[] {
  const events = world.events;
  world.events = [];
  return events;
}
