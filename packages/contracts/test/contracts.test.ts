import { describe, expect, it } from 'vitest';
import {
  compareRanking,
  isSameMatch,
  paginate,
  parseMatchRecordInput,
  parsePagination,
  type MatchRecordInput,
} from '../src';

const base: MatchRecordInput = {
  matchId: 'm-1',
  playerId: 'p-1',
  playerName: 'Captain',
  score: 10,
  durationMs: 120_000,
  endReason: 'timeUp',
  grade: 'B',
  endedAt: '2026-10-07T12:00:00.000Z',
  config: { difficulty: 'normal', sessionTime: 120, spawnInterval: 3 },
};

describe('compareRanking', () => {
  it('orders by score, then duration, then date, then id', () => {
    const entries = [
      {
        ...base,
        matchId: 'd',
        score: 10,
        durationMs: 120_000,
        endedAt: '2026-10-07T12:00:00.000Z',
      },
      { ...base, matchId: 'a', score: 12 },
      { ...base, matchId: 'c', score: 10, durationMs: 90_000 },
      {
        ...base,
        matchId: 'b',
        score: 10,
        durationMs: 120_000,
        endedAt: '2026-10-06T12:00:00.000Z',
      },
      {
        ...base,
        matchId: 'e',
        score: 10,
        durationMs: 120_000,
        endedAt: '2026-10-07T12:00:00.000Z',
      },
    ];
    expect(entries.sort(compareRanking).map((e) => e.matchId)).toEqual(['a', 'c', 'b', 'd', 'e']);
  });

  it('is deterministic regardless of input order', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      ...base,
      matchId: `m-${i}`,
      score: i % 3,
      durationMs: 60_000 + (i % 2) * 1000,
    }));
    const forward = [...items].sort(compareRanking).map((e) => e.matchId);
    const backward = [...items]
      .reverse()
      .sort(compareRanking)
      .map((e) => e.matchId);
    expect(backward).toEqual(forward);
  });
});

describe('parseMatchRecordInput', () => {
  it('accepts a valid record and normalises it', () => {
    const result = parseMatchRecordInput({
      ...base,
      playerName: '  Captain  ',
      durationMs: 1000.4,
    });
    expect(result).toEqual({ ok: true, value: { ...base, durationMs: 1000 } });
  });

  it.each([
    ['matchId', { matchId: 'bad id!' }],
    ['playerName', { playerName: '' }],
    ['score', { score: -1 }],
    ['score', { score: 1.5 }],
    ['endReason', { endReason: 'quit' }],
    ['endedAt', { endedAt: 'yesterday' }],
    ['config', { config: { difficulty: 'normal', sessionTime: 0, spawnInterval: 3 } }],
    ['config.difficulty', { config: { difficulty: 'insane', sessionTime: 60, spawnInterval: 3 } }],
    ['grade', { grade: 'Z' }],
  ])('rejects an invalid %s', (_field, patch) => {
    expect(parseMatchRecordInput({ ...base, ...patch }).ok).toBe(false);
  });
});

describe('idempotency helpers', () => {
  it('recognises the same match and a conflicting one', () => {
    expect(isSameMatch(base, { ...base })).toBe(true);
    expect(isSameMatch(base, { ...base, score: 11 })).toBe(false);
    expect(isSameMatch(base, { ...base, config: { ...base.config, difficulty: 'hard' } })).toBe(
      false,
    );
  });
});

describe('pagination', () => {
  it('parses defaults and rejects invalid values', () => {
    expect(parsePagination({ page: null, pageSize: null })).toEqual({
      ok: true,
      value: { page: 1, pageSize: 5 },
    });
    expect(parsePagination({ page: '0', pageSize: '5' }).ok).toBe(false);
    expect(parsePagination({ page: '1', pageSize: '500' }).ok).toBe(false);
  });

  it('slices pages and always reports at least one page', () => {
    const items = Array.from({ length: 12 }, (_, i) => i);
    expect(paginate(items, 3, 5)).toEqual({
      items: [10, 11],
      page: 3,
      pageSize: 5,
      totalItems: 12,
      totalPages: 3,
    });
    expect(paginate([], 1, 5).totalPages).toBe(1);
  });
});
