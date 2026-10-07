import { create } from 'zustand';
import type { HudSnapshot } from '@pirate/game-core';
import type { PauseReason } from '../game/session/GameSession';

interface MatchState {
  hud: HudSnapshot | null;
  paused: boolean;
  pauseReason: PauseReason | null;
  setHud(hud: HudSnapshot): void;
  setPaused(paused: boolean, reason: PauseReason | null): void;
  reset(): void;
}

/**
 * Low-frequency view of the running match for React (HUD, pause UI). The
 * simulation remains the source of truth; it pushes throttled snapshots here.
 */
export const useMatchStore = create<MatchState>((set) => ({
  hud: null,
  paused: false,
  pauseReason: null,
  setHud: (hud) => set({ hud }),
  setPaused: (paused, pauseReason) => set({ paused, pauseReason }),
  reset: () => set({ hud: null, paused: false, pauseReason: null }),
}));
