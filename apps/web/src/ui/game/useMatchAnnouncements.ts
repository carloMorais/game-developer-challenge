import { useEffect, useRef } from 'react';
import type { HudSnapshot } from '@pirate/game-core';
import { announce } from '../components/announcer';

const TIME_MARKS_S = [60, 30, 10];
const HEALTH_MARKS = [0.5, 0.25];
const SCORE_DEBOUNCE_MS = 2500;

/**
 * Screen-reader announcements for the match: start, score (debounced), time and
 * health thresholds, pause/resume and the outcome. Discrete events only, so the
 * live region never chatters at frame rate.
 */
export function useMatchAnnouncements(hud: HudSnapshot | null, paused: boolean): void {
  const prev = useRef<HudSnapshot | null>(null);
  const prevPaused = useRef(paused);
  const scoreTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!hud) {
      prev.current = null;
      return;
    }
    const last = prev.current;
    prev.current = hud;

    if (!last) {
      announce(`Battle started. ${Math.round(hud.remainingMs / 1000)} seconds on the clock.`);
      return;
    }

    if (hud.status === 'ended' && last.status !== 'ended') {
      window.clearTimeout(scoreTimer.current);
      announce(
        `Battle over. ${hud.endReason === 'timeUp' ? 'Time is up.' : 'Your ship sank.'} Final score ${hud.score}.`,
      );
      return;
    }

    if (hud.score !== last.score) {
      window.clearTimeout(scoreTimer.current);
      scoreTimer.current = window.setTimeout(() => {
        announce(`Score ${prev.current?.score ?? hud.score}.`);
      }, SCORE_DEBOUNCE_MS);
    }

    for (const mark of TIME_MARKS_S) {
      if (last.remainingMs > mark * 1000 && hud.remainingMs <= mark * 1000) {
        announce(`${mark} seconds remaining.`);
      }
    }

    for (const mark of HEALTH_MARKS) {
      const before = last.hp / last.maxHp;
      const now = hud.hp / hud.maxHp;
      if (before > mark && now <= mark && now > 0) {
        announce(`Hull at ${Math.round(now * 100)} percent.`);
      }
    }
  }, [hud]);

  useEffect(() => {
    if (prevPaused.current !== paused && prev.current?.status === 'running') {
      announce(paused ? 'Game paused.' : 'Game resumed.');
    }
    prevPaused.current = paused;
  }, [paused]);

  useEffect(() => () => window.clearTimeout(scoreTimer.current), []);
}
