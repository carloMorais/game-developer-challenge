import type { EnemyKind, GameConfig } from './config';
import { nextDifficulty, type Difficulty, type PresetDifficulty } from './difficulty';
import type { EndReason, GameEvent, World } from './world';

/** Best to worst. */
export const GRADES = ['S', 'A+', 'A', 'B', 'C', 'D'] as const;
export type Grade = (typeof GRADES)[number];

/** Minimum rating (0..100) for each grade. */
export const GRADE_THRESHOLDS: readonly { grade: Grade; min: number }[] = [
  { grade: 'S', min: 92 },
  { grade: 'A+', min: 85 },
  { grade: 'A', min: 75 },
  { grade: 'B', min: 60 },
  { grade: 'C', min: 40 },
  { grade: 'D', min: 0 },
];

/**
 * Rating weights. Kills dominate; health and survival only count when the
 * ship is still afloat, so a sunk ship tops out at {@link RATING.kills} (B).
 */
export const RATING = {
  kills: 60,
  health: 25,
  survival: 15,
  /** Share of the match's possible spawns that earns full kill points. */
  fullKillShare: 0.7,
} as const;

export interface MatchStats {
  kills: Record<EnemyKind, number>;
  /** Projectiles fired by the player (a broadside counts each ball). */
  shotsFired: number;
  /** Player projectiles that hit a ship. */
  hits: number;
}

export function createMatchStats(): MatchStats {
  return { kills: { chaser: 0, shooter: 0 }, shotsFired: 0, hits: 0 };
}

/** Folds simulation events into the player's match stats. */
export function recordMatchEvents(
  stats: MatchStats,
  events: readonly GameEvent[],
  world: World,
): void {
  for (const event of events) {
    if (event.type === 'shotFired' && event.shipId === world.playerId) {
      stats.shotsFired += event.count;
    } else if (
      event.type === 'projectileEnded' &&
      event.cause === 'hit' &&
      event.team === 'player'
    ) {
      stats.hits++;
    } else if (
      event.type === 'shipDestroyed' &&
      event.byTeam === 'player' &&
      event.kind !== 'player'
    ) {
      stats.kills[event.kind]++;
    }
  }
}

export function totalKills(stats: Pick<MatchStats, 'kills'>): number {
  return stats.kills.chaser + stats.kills.shooter;
}

/** Enemies the match could spawn over its full duration. */
export function possibleSpawns(config: Readonly<GameConfig>): number {
  const { duration } = config.match;
  const { interval, initialDelay } = config.spawn;
  return Math.max(1, Math.floor((duration - initialDelay) / interval) + 1);
}

export interface GradeInput {
  kills: number;
  endReason: EndReason;
  /** Remaining health, 0..1. */
  hpRatio: number;
  config: Readonly<GameConfig>;
}

/** 0..100 performance rating, see {@link RATING}. */
export function matchRating({ kills, endReason, hpRatio, config }: GradeInput): number {
  const killShare = kills / possibleSpawns(config);
  const killPart = Math.min(1, killShare / RATING.fullKillShare) * RATING.kills;
  if (endReason !== 'timeUp') return killPart;
  const health = Math.min(1, Math.max(0, hpRatio));
  return killPart + health * RATING.health + RATING.survival;
}

export function gradeForRating(rating: number): Grade {
  return GRADE_THRESHOLDS.find((t) => rating >= t.min - 1e-9)?.grade ?? 'D';
}

export function gradeMatch(input: GradeInput): Grade {
  return gradeForRating(matchRating(input));
}

/** True when `grade` is `min` or better. */
export function meetsGrade(grade: Grade, min: Grade): boolean {
  return GRADES.indexOf(grade) <= GRADES.indexOf(min);
}

/** Surviving to the end with at least this grade unlocks the next difficulty. */
export const UNLOCK_GRADE: Grade = 'B';

/** The difficulty a finished match unlocks, if it earned one. */
export function unlockedBy(
  difficulty: Difficulty,
  grade: Grade,
  endReason: EndReason,
): PresetDifficulty | null {
  if (endReason !== 'timeUp' || !meetsGrade(grade, UNLOCK_GRADE)) return null;
  return nextDifficulty(difficulty);
}

export function isGrade(value: unknown): value is Grade {
  return typeof value === 'string' && (GRADES as readonly string[]).includes(value);
}
