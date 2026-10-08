import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAME_CONFIG,
  DIFFICULTY_PRESETS,
  NORMAL_MODIFIERS,
  PRESET_DIFFICULTIES,
  RATING,
  applyDifficulty,
  createMatchConfig,
  createMatchStats,
  gradeForRating,
  gradeMatch,
  matchRating,
  meetsGrade,
  nextDifficulty,
  possibleSpawns,
  recordMatchEvents,
  resolveMatchSetup,
  unlockedBy,
  validateMatchOptions,
  type GameEvent,
} from '../src';
import { makeWorld } from './helpers';

describe('difficulty presets', () => {
  it('use valid Options values', () => {
    for (const id of PRESET_DIFFICULTIES) {
      expect(validateMatchOptions(DIFFICULTY_PRESETS[id].options)).toEqual({});
    }
  });

  it('Normal leaves the default balance untouched', () => {
    expect(applyDifficulty(DEFAULT_GAME_CONFIG, NORMAL_MODIFIERS)).toEqual(DEFAULT_GAME_CONFIG);
  });

  it('scale enemies without touching the player', () => {
    const hard = applyDifficulty(DEFAULT_GAME_CONFIG, DIFFICULTY_PRESETS.hard.modifiers);
    expect(hard.player).toEqual(DEFAULT_GAME_CONFIG.player);
    expect(hard.chaser.maxHp).toBeGreaterThan(DEFAULT_GAME_CONFIG.chaser.maxHp);
    expect(hard.shooter.weapon.damage).toBeGreaterThan(DEFAULT_GAME_CONFIG.shooter.weapon.damage);
    expect(hard.shooter.weapon.cooldown).toBeLessThan(DEFAULT_GAME_CONFIG.shooter.weapon.cooldown);
    expect(hard.spawn.maxAlive).toBe(DIFFICULTY_PRESETS.hard.modifiers.maxAlive);

    const easy = applyDifficulty(DEFAULT_GAME_CONFIG, DIFFICULTY_PRESETS.easy.modifiers);
    expect(easy.chaser.impactDamage).toBeLessThan(DEFAULT_GAME_CONFIG.chaser.impactDamage);
    expect(easy.chaser.movement.maxSpeed).toBeLessThan(
      DEFAULT_GAME_CONFIG.chaser.movement.maxSpeed,
    );
  });

  it('never mutates the base config', () => {
    const before = JSON.stringify(DEFAULT_GAME_CONFIG);
    applyDifficulty(DEFAULT_GAME_CONFIG, DIFFICULTY_PRESETS.hard.modifiers);
    expect(JSON.stringify(DEFAULT_GAME_CONFIG)).toBe(before);
  });

  it('Custom runs the Options values with Normal balance', () => {
    const setup = resolveMatchSetup('custom', { sessionTime: 75, spawnInterval: 6.5 });
    expect(setup.options).toEqual({ sessionTime: 75, spawnInterval: 6.5 });
    expect(setup.modifiers).toBe(NORMAL_MODIFIERS);
    const config = createMatchConfig(
      setup.options,
      applyDifficulty(DEFAULT_GAME_CONFIG, setup.modifiers),
    );
    expect(config.match.duration).toBe(75);
    expect(config.spawn.interval).toBe(6.5);
  });

  it('presets ignore the custom Options values', () => {
    const setup = resolveMatchSetup('challenging', { sessionTime: 61, spawnInterval: 9 });
    expect(setup.options).toEqual(DIFFICULTY_PRESETS.challenging.options);
  });

  it('unlock in order', () => {
    expect(nextDifficulty('easy')).toBe('normal');
    expect(nextDifficulty('normal')).toBe('challenging');
    expect(nextDifficulty('challenging')).toBe('hard');
    expect(nextDifficulty('hard')).toBeNull();
    expect(nextDifficulty('custom')).toBeNull();
  });
});

describe('grades', () => {
  const config = createMatchConfig({ sessionTime: 120, spawnInterval: 3 });
  const spawns = possibleSpawns(config);
  const fullKills = Math.ceil(spawns * RATING.fullKillShare);

  it('counts the spawns a full match allows', () => {
    // (120 - 1.5) / 3 → 39 intervals after the first spawn.
    expect(spawns).toBe(40);
  });

  it('gives S to a flawless, full-kill survival', () => {
    expect(gradeMatch({ kills: fullKills, endReason: 'timeUp', hpRatio: 1, config })).toBe('S');
  });

  it('caps a sunk ship at B', () => {
    const rating = matchRating({ kills: 999, endReason: 'destroyed', hpRatio: 0, config });
    expect(rating).toBe(RATING.kills);
    expect(gradeMatch({ kills: 999, endReason: 'destroyed', hpRatio: 0, config })).toBe('B');
  });

  it('rewards survival and health', () => {
    const base = { kills: 10, config } as const;
    const sunk = matchRating({ ...base, endReason: 'destroyed', hpRatio: 0 });
    const scraped = matchRating({ ...base, endReason: 'timeUp', hpRatio: 0.1 });
    const healthy = matchRating({ ...base, endReason: 'timeUp', hpRatio: 0.9 });
    expect(sunk).toBeLessThan(scraped);
    expect(scraped).toBeLessThan(healthy);
  });

  it('maps ratings to grades at the thresholds', () => {
    expect(gradeForRating(100)).toBe('S');
    expect(gradeForRating(92)).toBe('S');
    expect(gradeForRating(91.9)).toBe('A+');
    expect(gradeForRating(75)).toBe('A');
    expect(gradeForRating(60)).toBe('B');
    expect(gradeForRating(59)).toBe('C');
    expect(gradeForRating(0)).toBe('D');
  });

  it('compares grades', () => {
    expect(meetsGrade('A', 'B')).toBe(true);
    expect(meetsGrade('B', 'B')).toBe(true);
    expect(meetsGrade('C', 'B')).toBe(false);
  });
});

describe('unlocking', () => {
  it('needs survival and grade B or better', () => {
    expect(unlockedBy('easy', 'B', 'timeUp')).toBe('normal');
    expect(unlockedBy('easy', 'S', 'timeUp')).toBe('normal');
    expect(unlockedBy('easy', 'C', 'timeUp')).toBeNull();
    expect(unlockedBy('easy', 'B', 'destroyed')).toBeNull();
  });

  it('stops at the hardest preset and never comes from Custom', () => {
    expect(unlockedBy('hard', 'S', 'timeUp')).toBeNull();
    expect(unlockedBy('custom', 'S', 'timeUp')).toBeNull();
  });
});

describe('match stats', () => {
  it('tallies player shots, hits and kills by type', () => {
    const world = makeWorld();
    const stats = createMatchStats();
    const events: GameEvent[] = [
      {
        type: 'shotFired',
        tick: 1,
        shipId: world.playerId,
        slot: 'port',
        count: 3,
        x: 0,
        y: 0,
        angle: 0,
      },
      { type: 'shotFired', tick: 1, shipId: 99, slot: 'front', count: 1, x: 0, y: 0, angle: 0 },
      {
        type: 'projectileEnded',
        tick: 2,
        projectileId: 5,
        team: 'player',
        cause: 'hit',
        x: 0,
        y: 0,
      },
      {
        type: 'projectileEnded',
        tick: 2,
        projectileId: 6,
        team: 'enemy',
        cause: 'hit',
        x: 0,
        y: 0,
      },
      {
        type: 'projectileEnded',
        tick: 2,
        projectileId: 7,
        team: 'player',
        cause: 'island',
        x: 0,
        y: 0,
      },
      {
        type: 'shipDestroyed',
        tick: 3,
        shipId: 2,
        kind: 'chaser',
        cause: 'projectile',
        byTeam: 'player',
        x: 0,
        y: 0,
      },
      {
        type: 'shipDestroyed',
        tick: 3,
        shipId: 3,
        kind: 'chaser',
        cause: 'impact',
        byTeam: null,
        x: 0,
        y: 0,
      },
      {
        type: 'shipDestroyed',
        tick: 4,
        shipId: 4,
        kind: 'shooter',
        cause: 'projectile',
        byTeam: 'player',
        x: 0,
        y: 0,
      },
    ];
    recordMatchEvents(stats, events, world);
    expect(stats).toEqual({ kills: { chaser: 1, shooter: 1 }, shotsFired: 3, hits: 1 });
  });
});
