import { create } from 'zustand';
import {
  DEFAULT_MATCH_OPTIONS,
  isDifficulty,
  validateMatchOptions,
  type Difficulty,
  type MatchOptions,
} from '@pirate/game-core';
import { DEFAULT_PLAYER_LOOK, parseShipLook, type ShipLook } from '../game/shipLook';
import { STORAGE_KEYS, isRecord, randomId, readJson, writeJson } from '../lib/storage';

export const PLAYER_NAME_LIMITS = { min: 1, max: 20 } as const;
export const DEFAULT_PLAYER_NAME = 'Captain';

export function validatePlayerName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < PLAYER_NAME_LIMITS.min) return 'Captain name cannot be empty.';
  if (trimmed.length > PLAYER_NAME_LIMITS.max) {
    return `Captain name must be at most ${PLAYER_NAME_LIMITS.max} characters.`;
  }
  return null;
}

interface PersistedSettings {
  playerId: string;
  playerName: string;
  /** Custom battle values (Options screen). */
  options: MatchOptions;
  muted: boolean;
  /** Last difficulty picked before setting sail. */
  difficulty: Difficulty;
  /** The menu's How to play panel; open until the player collapses it. */
  howToPlayOpen: boolean;
  /** The player's ship: sail, pennant and hull. */
  shipLook: ShipLook;
}

function parseSettings(raw: unknown): Partial<PersistedSettings> | null {
  if (!isRecord(raw)) return null;
  const result: Partial<PersistedSettings> = {};
  if (typeof raw.playerId === 'string' && raw.playerId.length > 0) result.playerId = raw.playerId;
  if (typeof raw.playerName === 'string' && !validatePlayerName(raw.playerName)) {
    result.playerName = raw.playerName.trim();
  }
  if (isRecord(raw.options)) {
    const options = {
      sessionTime: Number(raw.options.sessionTime),
      spawnInterval: Number(raw.options.spawnInterval),
    };
    // Invalid stored values (edited by hand, older limits) fall back to defaults.
    if (Object.keys(validateMatchOptions(options)).length === 0) result.options = options;
  }
  if (typeof raw.muted === 'boolean') result.muted = raw.muted;
  if (isDifficulty(raw.difficulty)) result.difficulty = raw.difficulty;
  if (typeof raw.howToPlayOpen === 'boolean') result.howToPlayOpen = raw.howToPlayOpen;
  const shipLook = parseShipLook(raw.shipLook);
  if (shipLook) result.shipLook = shipLook;
  return result;
}

function loadSettings(): PersistedSettings {
  const stored = readJson(STORAGE_KEYS.settings, parseSettings) ?? {};
  const settings: PersistedSettings = {
    playerId: stored.playerId ?? randomId(),
    playerName: stored.playerName ?? DEFAULT_PLAYER_NAME,
    options: stored.options ?? { ...DEFAULT_MATCH_OPTIONS },
    muted: stored.muted ?? false,
    difficulty: stored.difficulty ?? 'easy',
    howToPlayOpen: stored.howToPlayOpen ?? true,
    shipLook: stored.shipLook ?? { ...DEFAULT_PLAYER_LOOK },
  };
  // Persist a freshly generated player id right away so it stays stable.
  if (!stored.playerId) writeJson(STORAGE_KEYS.settings, settings);
  return settings;
}

interface SettingsState extends PersistedSettings {
  /**
   * Saves validated options and name, and selects Custom so the next battle
   * uses them. Returns false if storage failed.
   */
  save(options: MatchOptions, playerName: string): boolean;
  setMuted(muted: boolean): void;
  setDifficulty(difficulty: Difficulty): void;
  setHowToPlayOpen(open: boolean): void;
  /** Saves the player's ship; returns false if storage failed. */
  setShipLook(look: ShipLook): boolean;
}

function persist(state: PersistedSettings): boolean {
  const { playerId, playerName, options, muted, difficulty, howToPlayOpen, shipLook } = state;
  return writeJson(STORAGE_KEYS.settings, {
    playerId,
    playerName,
    options,
    muted,
    difficulty,
    howToPlayOpen,
    shipLook,
  });
}

/** Player identity and preferences, persisted locally across reloads. */
export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...loadSettings(),
  save: (options, playerName) => {
    set({ options: { ...options }, playerName: playerName.trim(), difficulty: 'custom' });
    return persist(get());
  },
  setMuted: (muted) => {
    set({ muted });
    persist(get());
  },
  setDifficulty: (difficulty) => {
    set({ difficulty });
    persist(get());
  },
  setHowToPlayOpen: (howToPlayOpen) => {
    set({ howToPlayOpen });
    persist(get());
  },
  setShipLook: (shipLook) => {
    set({ shipLook: { ...shipLook } });
    return persist(get());
  },
}));
