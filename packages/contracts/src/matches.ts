export type MatchEndReason = 'timeUp' | 'destroyed';

/** Mirrors the game's difficulty ids; `custom` uses the player's Options values. */
export const MATCH_DIFFICULTIES = ['easy', 'normal', 'challenging', 'hard', 'custom'] as const;
export type MatchDifficulty = (typeof MATCH_DIFFICULTIES)[number];

/** Performance grade, best first. */
export const MATCH_GRADES = ['S', 'A+', 'A', 'B', 'C', 'D'] as const;
export type MatchGrade = (typeof MATCH_GRADES)[number];

/** Player-facing settings a match ran with; ranking only compares equal configs. */
export interface MatchConfigDto {
  difficulty: MatchDifficulty;
  /** Seconds. */
  sessionTime: number;
  /** Seconds. */
  spawnInterval: number;
}

/** Sent by the client when a match is completed. `matchId` makes it idempotent. */
export interface MatchRecordInput {
  matchId: string;
  playerId: string;
  playerName: string;
  score: number;
  /** Effective (unpaused) play time in milliseconds. */
  durationMs: number;
  endReason: MatchEndReason;
  grade: MatchGrade;
  /** ISO 8601 timestamp. */
  endedAt: string;
  config: MatchConfigDto;
}

/** A stored match as returned by the API. */
export interface MatchRecord extends MatchRecordInput {
  /** ISO 8601 timestamp of when the server stored it. */
  recordedAt: string;
}

export interface RegisterMatchResponse {
  record: MatchRecord;
  /** false when the match had already been recorded (retry / duplicate submit). */
  created: boolean;
}

/** Key used to group ranking entries: only matches with the same config compete. */
export function configKey(config: MatchConfigDto): string {
  return `${config.difficulty}/${config.sessionTime}s/${config.spawnInterval}s`;
}
