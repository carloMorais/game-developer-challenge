import { circleHitsIsland } from '../arena';
import type { EnemyKind } from '../config';
import { TIME_EPSILON, distanceSq } from '../math';
import type { World } from '../world';
import { SIMULATION_OWNER, createShip, getPlayer } from '../world';
import { hullExtent, isAlive, isRunning, random } from './shared';

/**
 * Spawns an enemy every `spawn.interval` seconds of active play while below
 * `maxAlive`. Spawn points must be clear of islands and other ships, and far
 * enough from the player that no damage is unavoidable.
 */
export function spawnSystem(world: World, dtMs: number): void {
  if (!isRunning(world)) return;
  const { spawn } = world.config;

  world.spawn.timerMs -= dtMs;
  while (world.spawn.timerMs <= TIME_EPSILON) {
    world.spawn.timerMs += spawn.interval * 1000;
    const alive = world.ships.filter((s) => s.team === 'enemy' && isAlive(s)).length;
    if (alive < spawn.maxAlive) spawnEnemy(world, pickKind(world));
  }
}

function pickKind(world: World): EnemyKind {
  const { openingSequence, weights } = world.config.spawn;
  const scripted = openingSequence[world.spawn.count];
  if (scripted) return scripted;
  const total = weights.chaser + weights.shooter;
  return random(world) * total < weights.chaser ? 'chaser' : 'shooter';
}

/** Returns false when no valid spawn point was found this time. */
export function spawnEnemy(world: World, kind: EnemyKind): boolean {
  const point = findSpawnPoint(world, kind);
  if (!point) return false;
  const player = getPlayer(world);
  const angle = player ? Math.atan2(player.y - point.y, player.x - point.x) : 0;
  createShip(world, kind, point.x, point.y, angle, SIMULATION_OWNER);
  world.spawn.count++;
  return true;
}

function findSpawnPoint(world: World, kind: EnemyKind): { x: number; y: number } | null {
  const { arena, config } = world;
  const { edgePadding, clearance, minDistanceFromPlayer, maxAttempts } = config.spawn;
  const extent = hullExtent(config[kind].hull);
  const player = getPlayer(world);
  const minPlayerDistSq = minDistanceFromPlayer ** 2;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const x = edgePadding + random(world) * (arena.width - edgePadding * 2);
    const y = edgePadding + random(world) * (arena.height - edgePadding * 2);

    if (circleHitsIsland(arena, x, y, extent + clearance)) continue;
    const blocked = world.ships.some((other) => {
      if (!isAlive(other)) return false;
      const reach = extent + hullExtent(config[other.kind].hull) + clearance;
      return distanceSq(x, y, other.x, other.y) < reach * reach;
    });
    if (blocked) continue;

    if (player && distanceSq(x, y, player.x, player.y) < minPlayerDistSq) continue;
    return { x, y };
  }

  // The spawn is skipped rather than placed unsafely; the next interval retries.
  return null;
}
