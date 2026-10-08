import { create } from 'zustand';
import {
  PRESET_DIFFICULTIES,
  isDifficulty,
  isGrade,
  meetsGrade,
  unlockedBy,
  type Difficulty,
  type EndReason,
  type Grade,
  type PresetDifficulty,
} from '@pirate/game-core';
import { STORAGE_KEYS, isRecord, readJson, writeJson } from '../lib/storage';
import { testMode } from '../lib/testMode';

interface PersistedProgress {
  /** Index into {@link PRESET_DIFFICULTIES} of the hardest unlocked preset. */
  unlockedIndex: number;
  best: Partial<Record<Difficulty, Grade>>;
}

function parseProgress(raw: unknown): PersistedProgress | null {
  if (!isRecord(raw)) return null;
  const index = Number(raw.unlockedIndex);
  const best: PersistedProgress['best'] = {};
  if (isRecord(raw.best)) {
    for (const [key, grade] of Object.entries(raw.best)) {
      if (isDifficulty(key) && isGrade(grade)) best[key] = grade;
    }
  }
  return {
    unlockedIndex: Number.isInteger(index)
      ? Math.min(PRESET_DIFFICULTIES.length - 1, Math.max(0, index))
      : 0,
    best,
  };
}

interface ProgressState extends PersistedProgress {
  isUnlocked(difficulty: Difficulty): boolean;
  /**
   * Records a finished match. Returns the difficulty it unlocked, if any.
   */
  recordMatch(difficulty: Difficulty, grade: Grade, endReason: EndReason): PresetDifficulty | null;
}

/** Local campaign progress: unlocked difficulties and best grade per difficulty. */
export const useProgressStore = create<ProgressState>((set, get) => ({
  ...(readJson(STORAGE_KEYS.progress, parseProgress) ?? { unlockedIndex: 0, best: {} }),

  // Custom is always available: the Options screen must keep working.
  isUnlocked: (difficulty) =>
    difficulty === 'custom' ||
    testMode.unlockAll ||
    PRESET_DIFFICULTIES.indexOf(difficulty) <= get().unlockedIndex,

  recordMatch: (difficulty, grade, endReason) => {
    const state = get();
    const best = { ...state.best };
    const previous = best[difficulty];
    if (!previous || meetsGrade(grade, previous)) best[difficulty] = grade;

    let unlocked: PresetDifficulty | null = null;
    const next = unlockedBy(difficulty, grade, endReason);
    if (next) {
      const nextIndex = PRESET_DIFFICULTIES.indexOf(next);
      if (nextIndex > state.unlockedIndex) {
        unlocked = next;
        set({ unlockedIndex: nextIndex });
      }
    }
    set({ best });
    const { unlockedIndex } = get();
    writeJson(STORAGE_KEYS.progress, { unlockedIndex, best } satisfies PersistedProgress);
    return unlocked;
  },
}));
