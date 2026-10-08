import { PAGE_SIZE_LIMITS } from './api';
import {
  MATCH_DIFFICULTIES,
  MATCH_GRADES,
  type MatchConfigDto,
  type MatchDifficulty,
  type MatchGrade,
  type MatchRecordInput,
} from './matches';

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const MAX_SCORE = 10_000;
const MAX_DURATION_MS = 60 * 60 * 1000;
const MAX_NAME = 20;
const ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseMatchConfig(raw: unknown): ParseResult<MatchConfigDto> {
  if (!isRecord(raw)) return { ok: false, error: 'config must be an object' };
  const { difficulty, sessionTime, spawnInterval } = raw;
  if (!(MATCH_DIFFICULTIES as readonly unknown[]).includes(difficulty)) {
    return {
      ok: false,
      error: `config.difficulty must be one of ${MATCH_DIFFICULTIES.join(', ')}`,
    };
  }
  if (typeof sessionTime !== 'number' || !Number.isInteger(sessionTime) || sessionTime <= 0) {
    return { ok: false, error: 'config.sessionTime must be a positive integer' };
  }
  if (typeof spawnInterval !== 'number' || !(spawnInterval > 0)) {
    return { ok: false, error: 'config.spawnInterval must be a positive number' };
  }
  return {
    ok: true,
    value: { difficulty: difficulty as MatchDifficulty, sessionTime, spawnInterval },
  };
}

/** Validates an incoming match record (shared by mocks and the real server). */
export function parseMatchRecordInput(raw: unknown): ParseResult<MatchRecordInput> {
  if (!isRecord(raw)) return { ok: false, error: 'body must be an object' };
  const { matchId, playerId, playerName, score, durationMs, endReason, grade, endedAt } = raw;

  if (typeof matchId !== 'string' || !ID_PATTERN.test(matchId)) {
    return { ok: false, error: 'matchId is invalid' };
  }
  if (typeof playerId !== 'string' || !ID_PATTERN.test(playerId)) {
    return { ok: false, error: 'playerId is invalid' };
  }
  if (
    typeof playerName !== 'string' ||
    playerName.trim().length === 0 ||
    playerName.length > MAX_NAME
  ) {
    return { ok: false, error: `playerName must be 1-${MAX_NAME} characters` };
  }
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
    return { ok: false, error: 'score is invalid' };
  }
  if (
    typeof durationMs !== 'number' ||
    !Number.isFinite(durationMs) ||
    durationMs < 0 ||
    durationMs > MAX_DURATION_MS
  ) {
    return { ok: false, error: 'durationMs is invalid' };
  }
  if (endReason !== 'timeUp' && endReason !== 'destroyed') {
    return { ok: false, error: 'endReason must be "timeUp" or "destroyed"' };
  }
  if (!(MATCH_GRADES as readonly unknown[]).includes(grade)) {
    return { ok: false, error: `grade must be one of ${MATCH_GRADES.join(', ')}` };
  }
  if (typeof endedAt !== 'string' || Number.isNaN(Date.parse(endedAt))) {
    return { ok: false, error: 'endedAt must be an ISO date' };
  }
  const config = parseMatchConfig(raw.config);
  if (!config.ok) return config;

  return {
    ok: true,
    value: {
      matchId,
      playerId,
      playerName: playerName.trim(),
      score,
      durationMs: Math.round(durationMs),
      endReason,
      grade: grade as MatchGrade,
      endedAt: new Date(endedAt).toISOString(),
      config: config.value,
    },
  };
}

/** True when two submissions describe the same match (safe idempotent retry). */
export function isSameMatch(a: MatchRecordInput, b: MatchRecordInput): boolean {
  return (
    a.matchId === b.matchId &&
    a.playerId === b.playerId &&
    a.score === b.score &&
    a.durationMs === b.durationMs &&
    a.endReason === b.endReason &&
    a.grade === b.grade &&
    a.endedAt === b.endedAt &&
    a.config.difficulty === b.config.difficulty &&
    a.config.sessionTime === b.config.sessionTime &&
    a.config.spawnInterval === b.config.spawnInterval
  );
}

/** Parses raw query values (e.g. from `URLSearchParams.get`). */
export function parsePagination(raw: {
  page: string | null;
  pageSize: string | null;
}): ParseResult<{ page: number; pageSize: number }> {
  const page = Number(raw.page ?? 1);
  const pageSize = Number(raw.pageSize ?? PAGE_SIZE_LIMITS.default);
  if (!Number.isInteger(page) || page < 1) return { ok: false, error: 'page must be >= 1' };
  if (
    !Number.isInteger(pageSize) ||
    pageSize < PAGE_SIZE_LIMITS.min ||
    pageSize > PAGE_SIZE_LIMITS.max
  ) {
    return { ok: false, error: `pageSize must be ${PAGE_SIZE_LIMITS.min}-${PAGE_SIZE_LIMITS.max}` };
  }
  return { ok: true, value: { page, pageSize } };
}

export function paginate<T>(items: readonly T[], page: number, pageSize: number) {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page, pageSize, totalItems, totalPages };
}
