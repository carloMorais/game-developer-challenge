import { create } from 'zustand';
import type { EndReason, MatchOptions } from '@pirate/game-core';
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
  options: MatchOptions;
  seed: number;
}

function parseResult(raw: unknown): MatchResult | null {
  if (!isRecord(raw) || !isRecord(raw.options)) return null;
  const { matchId, playerId, playerName, score, durationMs, endReason, endedAt, seed } = raw;
  if (
    typeof matchId !== 'string' ||
    typeof playerId !== 'string' ||
    typeof playerName !== 'string' ||
    typeof score !== 'number' ||
    typeof durationMs !== 'number' ||
    (endReason !== 'timeUp' && endReason !== 'destroyed') ||
    typeof endedAt !== 'string' ||
    typeof seed !== 'number'
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
    options: {
      sessionTime: Number(raw.options.sessionTime),
      spawnInterval: Number(raw.options.spawnInterval),
    },
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
