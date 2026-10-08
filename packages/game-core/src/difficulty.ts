import { DEFAULT_GAME_CONFIG, type GameConfig, type MatchOptions } from './config';

export const PRESET_DIFFICULTIES = ['easy', 'normal', 'challenging', 'hard'] as const;
export type PresetDifficulty = (typeof PRESET_DIFFICULTIES)[number];
/** `custom` runs the Options screen values with the Normal balance. */
export type Difficulty = PresetDifficulty | 'custom';
export const DIFFICULTIES: readonly Difficulty[] = [...PRESET_DIFFICULTIES, 'custom'];

/**
 * Balance knobs a difficulty applies on top of the base config. Scales are
 * multipliers (1 = unchanged); the rest replace the base value.
 */
export interface DifficultyModifiers {
  enemyHpScale: number;
  enemyDamageScale: number;
  enemySpeedScale: number;
  /** Multiplies the Shooter's cooldown: below 1 fires more often. */
  enemyReloadScale: number;
  maxAlive: number;
  /** Share of Shooters among random spawns (0..1). */
  shooterShare: number;
}

export interface DifficultyPreset {
  id: PresetDifficulty;
  /** Themed name shown on cards and in the ranking. */
  name: string;
  /** Plain difficulty level shown under the name. */
  level: string;
  description: string;
  options: MatchOptions;
  modifiers: DifficultyModifiers;
}

export const NORMAL_MODIFIERS: DifficultyModifiers = {
  enemyHpScale: 1,
  enemyDamageScale: 1,
  enemySpeedScale: 1,
  enemyReloadScale: 1,
  maxAlive: DEFAULT_GAME_CONFIG.spawn.maxAlive,
  shooterShare: DEFAULT_GAME_CONFIG.spawn.weights.shooter,
};

/** Ordered from easiest to hardest; each one unlocks the next. */
export const DIFFICULTY_PRESETS: Readonly<Record<PresetDifficulty, DifficultyPreset>> = {
  easy: {
    id: 'easy',
    name: 'Calm Waters',
    level: 'Easy',
    description: 'Fewer, weaker ships. Learn the ropes.',
    options: { sessionTime: 90, spawnInterval: 4 },
    modifiers: {
      enemyHpScale: 0.75,
      enemyDamageScale: 0.6,
      enemySpeedScale: 0.85,
      enemyReloadScale: 1.25,
      maxAlive: 5,
      shooterShare: 0.35,
    },
  },
  normal: {
    id: 'normal',
    name: 'Open Sea',
    level: 'Normal',
    description: 'The standard battle.',
    options: { sessionTime: 120, spawnInterval: 3 },
    modifiers: NORMAL_MODIFIERS,
  },
  challenging: {
    id: 'challenging',
    name: 'Storm',
    level: 'Challenging',
    description: 'Tougher hulls and faster crews.',
    options: { sessionTime: 120, spawnInterval: 2.5 },
    modifiers: {
      enemyHpScale: 1.2,
      enemyDamageScale: 1.25,
      enemySpeedScale: 1.1,
      enemyReloadScale: 0.85,
      maxAlive: 10,
      shooterShare: 0.5,
    },
  },
  hard: {
    id: 'hard',
    name: 'Kraken’s Wrath',
    level: 'Hard',
    description: 'A relentless armada. Good luck, captain.',
    options: { sessionTime: 150, spawnInterval: 2 },
    modifiers: {
      enemyHpScale: 1.4,
      enemyDamageScale: 1.5,
      enemySpeedScale: 1.2,
      enemyReloadScale: 0.7,
      maxAlive: 12,
      shooterShare: 0.55,
    },
  },
};

export const CUSTOM_DIFFICULTY = {
  name: 'Custom',
  level: 'Your settings',
  description: 'Session and spawn times from Options, Normal balance.',
} as const;

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && (DIFFICULTIES as readonly string[]).includes(value);
}

export function difficultyName(difficulty: Difficulty): string {
  return difficulty === 'custom' ? CUSTOM_DIFFICULTY.name : DIFFICULTY_PRESETS[difficulty].name;
}

/** The preset after `difficulty`, or null for the hardest one and Custom. */
export function nextDifficulty(difficulty: Difficulty): PresetDifficulty | null {
  if (difficulty === 'custom') return null;
  return PRESET_DIFFICULTIES[PRESET_DIFFICULTIES.indexOf(difficulty) + 1] ?? null;
}

export interface MatchSetup {
  difficulty: Difficulty;
  options: MatchOptions;
  modifiers: DifficultyModifiers;
}

/** What a match runs with: a preset, or the custom Options values. */
export function resolveMatchSetup(difficulty: Difficulty, customOptions: MatchOptions): MatchSetup {
  if (difficulty === 'custom') {
    return { difficulty, options: { ...customOptions }, modifiers: NORMAL_MODIFIERS };
  }
  const preset = DIFFICULTY_PRESETS[difficulty];
  return { difficulty, options: { ...preset.options }, modifiers: preset.modifiers };
}

/** Returns a copy of `base` with the difficulty's balance applied. */
export function applyDifficulty(base: GameConfig, modifiers: DifficultyModifiers): GameConfig {
  const config = JSON.parse(JSON.stringify(base)) as GameConfig;
  const { enemyHpScale, enemyDamageScale, enemySpeedScale, enemyReloadScale } = modifiers;

  for (const enemy of [config.chaser, config.shooter]) {
    enemy.maxHp = Math.round(enemy.maxHp * enemyHpScale);
    enemy.movement.maxSpeed *= enemySpeedScale;
    enemy.movement.acceleration *= enemySpeedScale;
  }
  config.chaser.impactDamage = Math.round(config.chaser.impactDamage * enemyDamageScale);
  config.shooter.weapon.damage = Math.round(config.shooter.weapon.damage * enemyDamageScale);
  config.shooter.weapon.cooldown *= enemyReloadScale;

  config.spawn.maxAlive = modifiers.maxAlive;
  config.spawn.weights = { chaser: 1 - modifiers.shooterShare, shooter: modifiers.shooterShare };
  return config;
}
