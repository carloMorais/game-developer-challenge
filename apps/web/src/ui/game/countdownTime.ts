import type { HudSnapshot } from '@pirate/game-core';
import { COUNTDOWN_MS } from '../../game/audio/GameAudio';

/** Seconds left to show in the countdown, or null outside the final stretch. */
export function countdownSecond(hud: HudSnapshot): number | null {
  if (hud.status !== 'running' || hud.remainingMs > COUNTDOWN_MS) return null;
  const second = Math.ceil(hud.remainingMs / 1000);
  return second >= 1 ? second : null;
}
