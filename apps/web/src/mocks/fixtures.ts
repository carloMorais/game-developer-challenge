import {
  DEFAULT_GAME_CONFIG,
  applyDifficulty,
  createMatchConfig,
  DIFFICULTY_PRESETS,
  createRng,
  gradeMatch,
  resolveMatchSetup,
  type PresetDifficulty,
} from '@pirate/game-core';
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
  const { modifiers } = resolveMatchSetup(config.difficulty, config);
  const gameConfig = createMatchConfig(config, applyDifficulty(DEFAULT_GAME_CONFIG, modifiers));
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
    const hpRatio = destroyed ? 0 : 0.15 + rng.next() * 0.85;
    const endReason = destroyed ? 'destroyed' : 'timeUp';
    const grade = gradeMatch({ kills: score, endReason, hpRatio, config: gameConfig });
    const matchId = `${options.idPrefix ?? 'fixture'}-${config.difficulty}-${config.sessionTime}-${config.spawnInterval}-${i + 1}`;
    records.push({
      // "1.5" -> "1p5": ids stay within the API's [A-Za-z0-9-] pattern.
      matchId: matchId.replace(/\./g, 'p'),
      playerId: options.playerId ?? fixturePlayerId(captain),
      playerName: options.playerName ?? CAPTAINS[captain]!,
      score,
      durationMs,
      endReason,
      grade,
      endedAt,
      config,
      recordedAt: endedAt,
    });
  }
  return records;
}

/** A difficulty's ranking key data. Presets always run their fixed times. */
export function presetConfig(difficulty: PresetDifficulty): MatchConfigDto {
  return { difficulty, ...DIFFICULTY_PRESETS[difficulty].options };
}

/**
 * Initial leaderboard: every difficulty plus a few custom settings. Easy (the
 * first one a new player sees) and the default custom one span several pages.
 */
export function initialFixtures(): MatchRecord[] {
  return [
    ...generateRecords(presetConfig('easy'), 14, 101),
    ...generateRecords(presetConfig('normal'), 9, 202),
    ...generateRecords(presetConfig('challenging'), 6, 303),
    ...generateRecords(presetConfig('hard'), 4, 404),
    ...generateRecords({ difficulty: 'custom', sessionTime: 120, spawnInterval: 3 }, 12, 505),
    ...generateRecords({ difficulty: 'custom', sessionTime: 60, spawnInterval: 3 }, 7, 606),
    ...generateRecords({ difficulty: 'custom', sessionTime: 180, spawnInterval: 1.5 }, 4, 707),
  ];
}
