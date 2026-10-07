/**
 * Every gameplay tunable lives here. Systems read values from the match config
 * snapshot and never hard-code balance numbers, so rebalancing only touches data.
 *
 * Units: distances in world pixels, time in seconds (converted to ms internally
 * where noted), angles in radians, speeds per second.
 */

export type EnemyKind = 'chaser' | 'shooter';
export type ShipKind = 'player' | EnemyKind;

/**
 * Hull collision shape: circles of `radius` placed along the ship's heading at
 * `offsets` (positive = towards the bow). Approximates the elongated sprites.
 */
export interface HullConfig {
  radius: number;
  offsets: readonly number[];
}

export interface MovementConfig {
  maxSpeed: number;
  /** Speed gained per second while throttling. */
  acceleration: number;
  /** Speed lost per second while not throttling. */
  deceleration: number;
  /** Radians per second. */
  turnRate: number;
}

export interface WeaponConfig {
  damage: number;
  /** Seconds between shots. */
  cooldown: number;
  projectileSpeed: number;
  /** Maximum travel distance; the projectile expires after it. */
  range: number;
  projectileRadius: number;
  /** Projectiles per shot. Broadsides fire several parallel shots. */
  count: number;
  /** Distance between parallel projectiles along the hull (count > 1). */
  spacing: number;
  /** Distance from the ship's centre where projectiles spawn. */
  muzzleOffset: number;
}

export interface ShipConfig {
  maxHp: number;
  hull: HullConfig;
  movement: MovementConfig;
}

export interface PlayerConfig extends ShipConfig {
  weapons: {
    front: WeaponConfig;
    broadside: WeaponConfig;
  };
}

export interface ChaserConfig extends ShipConfig {
  /** Damage dealt to the player on impact; the chaser explodes. */
  impactDamage: number;
}

export interface ShooterConfig extends ShipConfig {
  /** Starts firing when the player is within this distance (and visible). */
  attackRange: number;
  /** Stops approaching once this close. */
  preferredRange: number;
  /** Max heading error (radians) to open fire. */
  aimTolerance: number;
  weapon: WeaponConfig;
}

export interface SpawnConfig {
  /** Seconds between spawns. User-configurable within {@link OPTION_LIMITS}. */
  interval: number;
  /** Seconds before the first spawn. */
  initialDelay: number;
  maxAlive: number;
  /** Relative weights used after the guaranteed opening sequence. */
  weights: Record<EnemyKind, number>;
  /** First spawns follow this order so every match shows both enemy types. */
  openingSequence: readonly EnemyKind[];
  /** Minimum distance between a spawn point and the player. */
  minDistanceFromPlayer: number;
  /** Extra clearance from islands and other ships. */
  clearance: number;
  /** Minimum distance from the arena edges. */
  edgePadding: number;
  /** Random candidates tried before falling back to the farthest valid one. */
  maxAttempts: number;
}

export interface MatchRulesConfig {
  /** Seconds of active play. User-configurable within {@link OPTION_LIMITS}. */
  duration: number;
  /** Points per enemy destroyed by the player's weapons. */
  pointsPerKill: number;
}

export interface GameConfig {
  match: MatchRulesConfig;
  spawn: SpawnConfig;
  player: PlayerConfig;
  chaser: ChaserConfig;
  shooter: ShooterConfig;
}

const PLAYER_HULL: HullConfig = { radius: 20, offsets: [-24, 0, 24] };
const CHASER_HULL: HullConfig = { radius: 16, offsets: [-18, 0, 18] };
const SHOOTER_HULL: HullConfig = { radius: 19, offsets: [-22, 0, 22] };

export const DEFAULT_GAME_CONFIG: GameConfig = {
  match: { duration: 120, pointsPerKill: 1 },
  spawn: {
    interval: 3,
    initialDelay: 1.5,
    maxAlive: 8,
    weights: { chaser: 0.55, shooter: 0.45 },
    openingSequence: ['chaser', 'shooter'],
    minDistanceFromPlayer: 380,
    clearance: 12,
    edgePadding: 56,
    maxAttempts: 40,
  },
  player: {
    maxHp: 100,
    hull: PLAYER_HULL,
    movement: { maxSpeed: 150, acceleration: 220, deceleration: 140, turnRate: 2.4 },
    weapons: {
      front: {
        damage: 20,
        cooldown: 0.4,
        projectileSpeed: 560,
        range: 460,
        projectileRadius: 5,
        count: 1,
        spacing: 0,
        muzzleOffset: 52,
      },
      broadside: {
        damage: 20,
        cooldown: 1.3,
        projectileSpeed: 480,
        range: 320,
        projectileRadius: 5,
        count: 3,
        spacing: 24,
        muzzleOffset: 26,
      },
    },
  },
  chaser: {
    maxHp: 40,
    hull: CHASER_HULL,
    movement: { maxSpeed: 128, acceleration: 200, deceleration: 140, turnRate: 2.1 },
    impactDamage: 20,
  },
  shooter: {
    maxHp: 60,
    hull: SHOOTER_HULL,
    movement: { maxSpeed: 92, acceleration: 160, deceleration: 160, turnRate: 1.8 },
    attackRange: 380,
    preferredRange: 290,
    aimTolerance: 0.14,
    weapon: {
      damage: 8,
      cooldown: 1.9,
      projectileSpeed: 380,
      range: 420,
      projectileRadius: 5,
      count: 1,
      spacing: 0,
      muzzleOffset: 44,
    },
  },
};

/** Player-facing options exposed on the Options screen. */
export interface MatchOptions {
  /** Seconds, integer. */
  sessionTime: number;
  /** Seconds, may be fractional. */
  spawnInterval: number;
}

export const OPTION_LIMITS = {
  sessionTime: { min: 60, max: 180, step: 1, default: DEFAULT_GAME_CONFIG.match.duration },
  spawnInterval: { min: 1, max: 15, step: 0.5, default: DEFAULT_GAME_CONFIG.spawn.interval },
} as const;

export type MatchOptionsErrors = Partial<Record<keyof MatchOptions, string>>;

export function validateMatchOptions(options: MatchOptions): MatchOptionsErrors {
  const errors: MatchOptionsErrors = {};
  const { sessionTime, spawnInterval } = OPTION_LIMITS;

  if (!Number.isFinite(options.sessionTime) || !Number.isInteger(options.sessionTime)) {
    errors.sessionTime = 'Game session time must be a whole number of seconds.';
  } else if (options.sessionTime < sessionTime.min || options.sessionTime > sessionTime.max) {
    errors.sessionTime = `Game session time must be between ${sessionTime.min} and ${sessionTime.max} seconds.`;
  }

  if (!Number.isFinite(options.spawnInterval)) {
    errors.spawnInterval = 'Enemy spawn time must be a number.';
  } else if (
    options.spawnInterval < spawnInterval.min ||
    options.spawnInterval > spawnInterval.max
  ) {
    errors.spawnInterval = `Enemy spawn time must be between ${spawnInterval.min} and ${spawnInterval.max} seconds.`;
  } else if (
    Math.abs(
      options.spawnInterval / spawnInterval.step -
        Math.round(options.spawnInterval / spawnInterval.step),
    ) > 1e-9
  ) {
    errors.spawnInterval = `Enemy spawn time must be a multiple of ${spawnInterval.step} seconds.`;
  }

  return errors;
}

export const DEFAULT_MATCH_OPTIONS: MatchOptions = {
  sessionTime: OPTION_LIMITS.sessionTime.default,
  spawnInterval: OPTION_LIMITS.spawnInterval.default,
};

/**
 * Builds the immutable config snapshot a match runs with. Later option changes
 * only affect new matches.
 */
export function createMatchConfig(
  options: MatchOptions,
  base: GameConfig = DEFAULT_GAME_CONFIG,
): Readonly<GameConfig> {
  if (Object.keys(validateMatchOptions(options)).length > 0) {
    throw new RangeError('Invalid match options');
  }
  // The config is plain JSON data, so a JSON round-trip is a faithful deep copy.
  const config = JSON.parse(JSON.stringify(base)) as GameConfig;
  config.match.duration = options.sessionTime;
  config.spawn.interval = options.spawnInterval;
  return deepFreeze(config);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
