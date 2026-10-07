import type { MatchConfigDto, MatchRecord } from './matches';

export interface RankingEntry {
  /** 1-based position within the config's leaderboard. */
  rank: number;
  matchId: string;
  playerId: string;
  playerName: string;
  score: number;
  durationMs: number;
  endedAt: string;
}

export interface RankingConfigSummary {
  config: MatchConfigDto;
  entries: number;
}

export interface RankingConfigsResponse {
  configs: RankingConfigSummary[];
}

/**
 * Deterministic leaderboard order, shared by every backend implementation:
 * 1. higher score;
 * 2. shorter duration (same score reached faster);
 * 3. earlier `endedAt` (got there first);
 * 4. `matchId` (lexicographic) as the final, unique tie-breaker.
 */
export function compareRanking(
  a: Pick<MatchRecord, 'score' | 'durationMs' | 'endedAt' | 'matchId'>,
  b: Pick<MatchRecord, 'score' | 'durationMs' | 'endedAt' | 'matchId'>,
): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.durationMs !== b.durationMs) return a.durationMs - b.durationMs;
  if (a.endedAt !== b.endedAt) return a.endedAt < b.endedAt ? -1 : 1;
  return a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0;
}
