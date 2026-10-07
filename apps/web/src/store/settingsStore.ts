import { create } from 'zustand';
import { DEFAULT_MATCH_OPTIONS, validateMatchOptions, type MatchOptions } from '@pirate/game-core';
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
  options: MatchOptions;
  muted: boolean;
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
  return result;
}

function loadSettings(): PersistedSettings {
  const stored = readJson(STORAGE_KEYS.settings, parseSettings) ?? {};
  const settings: PersistedSettings = {
    playerId: stored.playerId ?? randomId(),
    playerName: stored.playerName ?? DEFAULT_PLAYER_NAME,
    options: stored.options ?? { ...DEFAULT_MATCH_OPTIONS },
    muted: stored.muted ?? false,
  };
  // Persist a freshly generated player id right away so it stays stable.
  if (!stored.playerId) writeJson(STORAGE_KEYS.settings, settings);
  return settings;
}

interface SettingsState extends PersistedSettings {
  /** Saves validated options and name. Returns false if storage failed. */
  save(options: MatchOptions, playerName: string): boolean;
  setMuted(muted: boolean): void;
}

function persist(state: PersistedSettings): boolean {
  const { playerId, playerName, options, muted } = state;
  return writeJson(STORAGE_KEYS.settings, { playerId, playerName, options, muted });
}

/** Player identity and preferences, persisted locally across reloads. */
export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...loadSettings(),
  save: (options, playerName) => {
    set({ options: { ...options }, playerName: playerName.trim() });
    return persist(get());
  },
  setMuted: (muted) => {
    set({ muted });
    persist(get());
  },
}));
