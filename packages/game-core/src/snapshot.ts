import type { EndReason, MatchStatus, World } from './world';
import { getPlayer } from './world';

/** Low-frequency summary for UI (HUD, live region, results). */
export interface HudSnapshot {
  hp: number;
  maxHp: number;
  score: number;
  elapsedMs: number;
  remainingMs: number;
  status: MatchStatus;
  endReason: EndReason | null;
  enemiesAlive: number;
}

export function getHudSnapshot(world: World): HudSnapshot {
  const player = getPlayer(world);
  const durationMs = world.config.match.duration * 1000;
  return {
    hp: player?.hp ?? 0,
    maxHp: world.config.player.maxHp,
    score: world.score,
    elapsedMs: world.elapsedMs,
    remainingMs: Math.max(0, durationMs - world.elapsedMs),
    status: world.status,
    endReason: world.endReason,
    enemiesAlive: world.ships.filter((s) => s.team === 'enemy').length,
  };
}
