import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import type { GameConfig } from '@pirate/game-core';
import { loadGameAssets, type GameAssets } from '../../game/assets/loadGameAssets';
import { GameSession, type MatchOutcome } from '../../game/session/GameSession';
import { useMatchStore } from '../../store/matchStore';
import { Hud } from './Hud';
import { TouchControls } from './TouchControls';
import { COARSE_POINTER_QUERY, TOUCH_GUTTER } from './touchLayout';
import { NO_INSETS } from '../../game/render/viewport';

interface GameScreenProps {
  config: Readonly<GameConfig>;
  seed: number;
  onEnd(outcome: MatchOutcome): void;
  onExit(): void;
}

type LoadState =
  | { status: 'loading'; progress: number }
  | { status: 'error'; message: string }
  | { status: 'ready'; assets: GameAssets };

/** Delay between the final blow and leaving the arena, so the explosion plays. */
const END_DELAY_MS = 1400;

export function GameScreen({ config, seed, onEnd, onExit }: GameScreenProps) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading', progress: 0 });
  const [attempt, setAttempt] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<GameSession | null>(null);
  const notifyEnd = useEffectEvent((outcome: MatchOutcome) => onEnd(outcome));

  const hud = useMatchStore((s) => s.hud);
  const paused = useMatchStore((s) => s.paused);

  // 1. Load (or reuse) textures, with progress and retry.
  useEffect(() => {
    let cancelled = false;
    loadGameAssets((progress) => {
      if (!cancelled) setLoad({ status: 'loading', progress });
    })
      .then((assets) => {
        if (!cancelled) setLoad({ status: 'ready', assets });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.warn(error);
        setLoad({ status: 'error', message: 'The battle assets could not be loaded.' });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // 2. One session per mounted screen; torn down on unmount (also under Strict Mode).
  const assets = load.status === 'ready' ? load.assets : null;
  useEffect(() => {
    const container = containerRef.current;
    if (!assets || !container) return;

    const store = useMatchStore.getState();
    store.reset();
    let endTimer: number | undefined;
    const session = new GameSession(
      { config, seed, assets },
      {
        onHud: (h) => useMatchStore.getState().setHud(h),
        onPauseChange: (p, reason) => useMatchStore.getState().setPaused(p, reason),
        onEnd: (outcome) => {
          endTimer = window.setTimeout(() => notifyEnd(outcome), END_DELAY_MS);
        },
      },
    );
    sessionRef.current = session;
    // Keep the arena clear of the on-screen buttons on touch devices.
    const coarse = window.matchMedia(COARSE_POINTER_QUERY);
    const applyInsets = () =>
      session.setInsets(
        coarse.matches ? { top: 0, bottom: 0, left: TOUCH_GUTTER, right: TOUCH_GUTTER } : NO_INSETS,
      );
    applyInsets();
    coarse.addEventListener('change', applyInsets);
    session.mount(container).catch((error: unknown) => {
      console.error(error);
      setLoad({ status: 'error', message: 'The game renderer could not start.' });
    });

    return () => {
      window.clearTimeout(endTimer);
      coarse.removeEventListener('change', applyInsets);
      session.destroy();
      if (sessionRef.current === session) sessionRef.current = null;
      useMatchStore.getState().reset();
    };
  }, [assets, config, seed]);

  const retry = () => {
    setLoad({ status: 'loading', progress: 0 });
    setAttempt((n) => n + 1);
  };

  const pause = useCallback(() => sessionRef.current?.pause('manual'), []);
  const resume = useCallback(() => sessionRef.current?.resume(), []);

  // Esc / P toggle pause while this screen is active.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Escape' && event.code !== 'KeyP') return;
      const session = sessionRef.current;
      if (!session || session.isEnded || event.repeat) return;
      event.preventDefault();
      if (session.isPaused) session.resume();
      else session.pause('manual');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <section className="game-screen" aria-label="Battle">
      <div ref={containerRef} className="game-canvas" />

      {load.status === 'loading' && (
        <div className="game-overlay" role="status" aria-live="polite">
          <p>Loading the fleet…</p>
          <progress max={1} value={load.progress} aria-label="Loading assets" />
        </div>
      )}

      {load.status === 'error' && (
        <div className="game-overlay" role="alert">
          <p>{load.message}</p>
          <div className="game-overlay__actions">
            <button type="button" className="btn btn--primary" onClick={retry}>
              Try again
            </button>
            <button type="button" className="btn btn--secondary" onClick={onExit}>
              Main menu
            </button>
          </div>
        </div>
      )}

      {load.status === 'ready' && hud && (
        <>
          <Hud hud={hud} onPause={pause} />
          <TouchControls
            onAction={(action, down) => sessionRef.current?.setTouchAction(action, down)}
          />
        </>
      )}

      {paused && (
        <div className="game-overlay" role="dialog" aria-modal="true" aria-labelledby="pause-title">
          <h2 id="pause-title">Paused</h2>
          <div className="game-overlay__actions">
            <button type="button" className="btn btn--primary" onClick={resume} autoFocus>
              Resume
            </button>
            <button type="button" className="btn btn--secondary" onClick={onExit}>
              Main menu
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
