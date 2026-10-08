import { create } from 'zustand';
import {
  isDifficulty,
  isGrade,
  type Difficulty,
  type EndReason,
  type Grade,
  type MatchOptions,
  type MatchStats,
  type PresetDifficulty,
} from '@pirate/game-core';
import type { MatchRecordInput } from '@pirate/contracts';
import { STORAGE_KEYS, isRecord, readJson, writeJson } from '../lib/storage';

/** The last completed match, persisted so the result survives a refresh. */
export interface MatchResult {
  matchId: string;
  playerId: string;
  playerName: string;
  score: number;
  /** Effective (active, unpaused) play time. */
  durationMs: number;
  endReason: EndReason;
  /** ISO timestamp of when the match ended. */
  endedAt: string;
  difficulty: Difficulty;
  /** Session and spawn times the match ran with. */
  options: MatchOptions;
  seed: number;
  grade: Grade;
  stats: MatchStats;
  hp: number;
  maxHp: number;
  /** Difficulty this match unlocked, if any. */
  unlocked: PresetDifficulty | null;
}

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

function parseStats(raw: unknown): MatchStats {
  const stats = isRecord(raw) ? raw : {};
  const kills = isRecord(stats.kills) ? stats.kills : {};
  return {
    kills: { chaser: num(kills.chaser), shooter: num(kills.shooter) },
    shotsFired: num(stats.shotsFired),
    hits: num(stats.hits),
  };
}

function parseResult(raw: unknown): MatchResult | null {
  if (!isRecord(raw) || !isRecord(raw.options)) return null;
  const { matchId, playerId, playerName, score, durationMs, endReason, endedAt, seed } = raw;
  const { difficulty, grade, unlocked } = raw;
  if (
    typeof matchId !== 'string' ||
    typeof playerId !== 'string' ||
    typeof playerName !== 'string' ||
    typeof score !== 'number' ||
    typeof durationMs !== 'number' ||
    (endReason !== 'timeUp' && endReason !== 'destroyed') ||
    typeof endedAt !== 'string' ||
    typeof seed !== 'number' ||
    !isDifficulty(difficulty) ||
    !isGrade(grade)
  ) {
    return null;
  }
  return {
    matchId,
    playerId,
    playerName,
    score,
    durationMs,
    endReason,
    endedAt,
    seed,
    difficulty,
    grade,
    options: {
      sessionTime: Number(raw.options.sessionTime),
      spawnInterval: Number(raw.options.spawnInterval),
    },
    stats: parseStats(raw.stats),
    hp: num(raw.hp),
    maxHp: num(raw.maxHp),
    unlocked: isDifficulty(unlocked) && unlocked !== 'custom' ? unlocked : null,
  };
}

interface ResultState {
  lastResult: MatchResult | null;
  setLastResult(result: MatchResult): void;
}

export const useResultStore = create<ResultState>((set) => ({
  lastResult: readJson(STORAGE_KEYS.lastResult, parseResult),
  setLastResult: (lastResult) => {
    writeJson(STORAGE_KEYS.lastResult, lastResult);
    set({ lastResult });
  },
}));

/** The API payload for a completed match. */
export function toRecordInput(result: MatchResult): MatchRecordInput {
  return {
    matchId: result.matchId,
    playerId: result.playerId,
    playerName: result.playerName,
    score: result.score,
    durationMs: result.durationMs,
    endReason: result.endReason,
    grade: result.grade,
    endedAt: result.endedAt,
    config: { difficulty: result.difficulty, ...result.options },
  };
}
