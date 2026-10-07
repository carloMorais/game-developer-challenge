import { createRng } from '@pirate/game-core';
import type { MatchConfigDto, MatchRecord } from '@pirate/contracts';

const CAPTAINS = [
  'Captain Flint',
  'Red Sparrow',
  'Storm Rider',
  'Sea Wolf',
  'Anne Bonny',
  'Black Bart',
  'Calico Jack',
  'Mary Read',
  'Iron Hook',
  'Salty Pete',
  'Grace O’Malley',
  'Long John',
  'Dread Kraken',
  'Lady Tempest',
  'Old Barnacle',
  'Silver Gull',
];

/** Fixed base date so fixtures (and screenshots) never depend on "now". */
const BASE_TIME = Date.parse('2026-09-08T21:42:00.000Z');

function fixturePlayerId(index: number): string {
  return `fixture-player-${String(index + 1).padStart(2, '0')}`;
}

/**
 * Deterministic records for other players. Same seed => same records, so the
 * ranking is stable across reloads, tests and the deployed demo.
 */
export function generateRecords(
  config: MatchConfigDto,
  count: number,
  seed: number,
  options: { playerId?: string; playerName?: string; idPrefix?: string } = {},
): MatchRecord[] {
  const rng = createRng(seed);
  const records: MatchRecord[] = [];
  for (let i = 0; i < count; i++) {
    const captain = Math.floor(rng.next() * CAPTAINS.length);
    const destroyed = rng.next() < 0.35;
    const durationMs = destroyed
      ? Math.round(config.sessionTime * 1000 * (0.35 + rng.next() * 0.6))
      : config.sessionTime * 1000;
    const perMinute = 6 + rng.next() * 10;
    const score = Math.max(0, Math.round((durationMs / 60_000) * perMinute));
    const endedAt = new Date(
      BASE_TIME - Math.round(rng.next() * 14 * 24 * 3600 * 1000),
    ).toISOString();
    const matchId = `${options.idPrefix ?? 'fixture'}-${config.sessionTime}-${config.spawnInterval}-${i + 1}`;
    records.push({
      // "1.5" -> "1p5": ids stay within the API's [A-Za-z0-9-] pattern.
      matchId: matchId.replace(/\./g, 'p'),
      playerId: options.playerId ?? fixturePlayerId(captain),
      playerName: options.playerName ?? CAPTAINS[captain]!,
      score,
      durationMs,
      endReason: destroyed ? 'destroyed' : 'timeUp',
      endedAt,
      config,
      recordedAt: endedAt,
    });
  }
  return records;
}

/** Initial leaderboard: several configs, the default one spanning multiple pages. */
export function initialFixtures(): MatchRecord[] {
  return [
    ...generateRecords({ sessionTime: 120, spawnInterval: 3 }, 14, 101),
    ...generateRecords({ sessionTime: 60, spawnInterval: 3 }, 7, 202),
    ...generateRecords({ sessionTime: 180, spawnInterval: 3 }, 6, 303),
    ...generateRecords({ sessionTime: 90, spawnInterval: 2 }, 5, 404),
    ...generateRecords({ sessionTime: 120, spawnInterval: 1.5 }, 4, 505),
  ];
}
