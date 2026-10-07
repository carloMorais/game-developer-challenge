import {
  DEFAULT_ARENA,
  DEFAULT_GAME_CONFIG,
  IDLE_INTENTS,
  STEP_MS,
  applyCommand,
  createShip,
  createWorld,
  getPlayer,
  stepWorld,
  type ArenaMap,
  type EnemyKind,
  type GameConfig,
  type Ship,
  type ShipIntents,
  type World,
} from '../src';

export const OPEN_ARENA: ArenaMap = { ...DEFAULT_ARENA, id: 'open', islands: [] };

/** Default config with spawning disabled and a long match, tweakable per test. */
export function testConfig(mutate?: (config: GameConfig) => void): GameConfig {
  const config = JSON.parse(JSON.stringify(DEFAULT_GAME_CONFIG)) as GameConfig;
  config.match.duration = 180;
  config.spawn.initialDelay = 1e6;
  mutate?.(config);
  return config;
}

export function makeWorld(
  options: { config?: GameConfig; arena?: ArenaMap; seed?: number } = {},
): World {
  return createWorld({
    config: options.config ?? testConfig(),
    arena: options.arena ?? OPEN_ARENA,
    seed: options.seed ?? 1,
  });
}

export function player(world: World): Ship {
  const ship = getPlayer(world);
  if (!ship) throw new Error('player missing');
  return ship;
}

export function setIntents(world: World, intents: Partial<ShipIntents>): void {
  applyCommand(world, {
    tick: world.tick,
    shipId: world.playerId,
    intents: { ...IDLE_INTENTS, ...intents },
  });
}

export function runFor(world: World, seconds: number, onStep?: (world: World) => void): void {
  const steps = Math.round((seconds * 1000) / STEP_MS);
  for (let i = 0; i < steps; i++) {
    stepWorld(world);
    onStep?.(world);
  }
}

export function addEnemy(world: World, kind: EnemyKind, x: number, y: number, angle = 0): Ship {
  return createShip(world, kind, x, y, angle, 'sim');
}

/** Places the player at a pose, at rest. */
export function placePlayer(world: World, x: number, y: number, angle: number): Ship {
  const ship = player(world);
  Object.assign(ship, { x, y, angle, prevX: x, prevY: y, prevAngle: angle, speed: 0 });
  return ship;
}
