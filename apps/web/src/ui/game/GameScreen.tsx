import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import type { EndReason, GameConfig } from '@pirate/game-core';
import { audio } from '../../game/audio/AudioManager';
import { GAME_SOUNDS, GameAudio } from '../../game/audio/GameAudio';
import { loadGameAssets, type GameAssets } from '../../game/assets/loadGameAssets';
import { NO_INSETS } from '../../game/render/viewport';
import { GameSession, type MatchOutcome } from '../../game/session/GameSession';
import { useMatchStore } from '../../store/matchStore';
import { announce } from '../components/announcer';
import { Dialog } from '../components/Dialog';
import { GameButton } from '../components/GameButton';
import { Panel } from '../components/Panel';
import { OptionsForm } from '../screens/OptionsForm';
import { Hud } from './Hud';
import { TouchControls } from './TouchControls';
import { COARSE_POINTER_QUERY, TOUCH_GUTTER } from './touchLayout';
import { useMatchAnnouncements } from './useMatchAnnouncements';

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

/** Delay between the final blow and the result screen, so the ending plays out. */
const END_DELAY_MS = 1600;
const PORTRAIT_QUERY = '(orientation: portrait) and (pointer: coarse)';

export function GameScreen({ config, seed, onEnd, onExit }: GameScreenProps) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading', progress: 0 });
  const [attempt, setAttempt] = useState(0);
  const [pauseView, setPauseView] = useState<'menu' | 'options'>('menu');
  const [ended, setEnded] = useState<EndReason | null>(null);
  const [portrait, setPortrait] = useState(() => window.matchMedia(PORTRAIT_QUERY).matches);
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<GameSession | null>(null);
  const notifyEnd = useEffectEvent((outcome: MatchOutcome) => onEnd(outcome));

  const hud = useMatchStore((s) => s.hud);
  const paused = useMatchStore((s) => s.paused);
  useMatchAnnouncements(hud, paused);

  // 1. Load (or reuse) textures with progress and retry. Sounds load alongside
  //    but never block the battle.
  useEffect(() => {
    let cancelled = false;
    void audio.preload(GAME_SOUNDS);
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
        announce('The battle assets could not be loaded.');
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

    useMatchStore.getState().reset();
    let endTimer: number | undefined;
    let sound: GameAudio | null = null;
    const session = new GameSession(
      { config, seed, assets },
      {
        onHud: (h) => useMatchStore.getState().setHud(h),
        onPauseChange: (p, reason) => {
          useMatchStore.getState().setPaused(p, reason);
          if (p) sound?.pause();
          else sound?.resume();
        },
        onEvents: (events) => sound?.handle(events),
        onFrame: () => sound?.update(),
        onEnd: (outcome) => {
          setEnded(outcome.endReason);
          endTimer = window.setTimeout(() => notifyEnd(outcome), END_DELAY_MS);
        },
      },
    );
    sound = new GameAudio(session.world);
    sessionRef.current = session;

    // Keep the arena clear of the on-screen buttons on touch devices.
    const coarse = window.matchMedia(COARSE_POINTER_QUERY);
    const applyInsets = () =>
      session.setInsets(
        coarse.matches ? { top: 0, bottom: 0, left: TOUCH_GUTTER, right: TOUCH_GUTTER } : NO_INSETS,
      );
    applyInsets();
    coarse.addEventListener('change', applyInsets);

    session
      .mount(container)
      .then(() => {
        if (window.matchMedia(PORTRAIT_QUERY).matches) session.pause('orientation');
        sound?.start();
      })
      .catch((error: unknown) => {
        console.error(error);
        setLoad({ status: 'error', message: 'The game renderer could not start.' });
      });

    return () => {
      window.clearTimeout(endTimer);
      coarse.removeEventListener('change', applyInsets);
      sound?.dispose();
      session.destroy();
      if (sessionRef.current === session) sessionRef.current = null;
      useMatchStore.getState().reset();
    };
  }, [assets, config, seed]);

  // Phones: the arena needs landscape. Turning to portrait pauses the battle.
  useEffect(() => {
    const query = window.matchMedia(PORTRAIT_QUERY);
    const onChange = () => {
      setPortrait(query.matches);
      if (query.matches) sessionRef.current?.pause('orientation');
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const retry = () => {
    setLoad({ status: 'loading', progress: 0 });
    setAttempt((n) => n + 1);
  };

  const pause = useCallback(() => sessionRef.current?.pause('manual'), []);
  const resume = useCallback(() => {
    setPauseView('menu');
    sessionRef.current?.resume();
  }, []);

  // Esc / P toggle pause while this screen is active; Esc in Options goes back.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Escape' && event.code !== 'KeyP') return;
      const session = sessionRef.current;
      if (!session || session.isEnded || event.repeat) return;
      // Typing a "p" in the options form must not resume the game.
      if (event.target instanceof HTMLInputElement && event.code === 'KeyP') return;
      event.preventDefault();
      if (!session.isPaused) {
        session.pause('manual');
      } else if (pauseView === 'options') {
        setPauseView('menu');
      } else if (!window.matchMedia(PORTRAIT_QUERY).matches) {
        resume();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pauseView, resume]);

  return (
    <section className="game-screen" aria-label="Battle">
      <div ref={containerRef} className="game-canvas" />

      {load.status === 'loading' && (
        <div className="game-overlay">
          <Panel>
            <p className="panel-title" id="loading-title">
              Loading the fleet…
            </p>
            <progress
              max={1}
              value={load.progress}
              aria-labelledby="loading-title"
              data-testid="loading-progress"
            />
            <p className="field__hint">{Math.round(load.progress * 100)}%</p>
          </Panel>
        </div>
      )}

      {load.status === 'error' && (
        <div className="game-overlay">
          <Panel>
            <p className="panel-title">Stormy waters</p>
            <p role="alert">{load.message}</p>
            <div className="menu-actions">
              <GameButton onClick={retry} data-autofocus>
                Try again
              </GameButton>
              <GameButton variant="secondary" size="small" sound="ui_back" onClick={onExit}>
                Main menu
              </GameButton>
            </div>
          </Panel>
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

      {ended && (
        <div className="end-banner" aria-hidden="true">
          {ended === 'timeUp' ? 'Time is up!' : 'Your ship sank!'}
        </div>
      )}

      {paused && !ended && !portrait && (
        <Dialog titleId="pause-title" describedBy="pause-desc">
          {pauseView === 'menu' ? (
            <>
              <h2 id="pause-title" className="panel-title">
                Paused
              </h2>
              <p id="pause-desc" className="tagline">
                Ready when you are.
              </p>
              <div className="menu-actions">
                <GameButton onClick={resume} data-autofocus>
                  Resume
                </GameButton>
                <GameButton sound="ui_open" onClick={() => setPauseView('options')}>
                  Options
                </GameButton>
                <GameButton sound="ui_back" onClick={onExit}>
                  Main menu
                </GameButton>
              </div>
            </>
          ) : (
            <>
              <h2 id="pause-title" className="panel-title">
                Options
              </h2>
              <OptionsForm
                note="Changes apply to your next battle."
                backLabel="Back"
                onBack={() => setPauseView('menu')}
              />
            </>
          )}
        </Dialog>
      )}

      {portrait && (
        <div className="rotate-overlay" role="alert">
          <div className="rotate-overlay__icon" aria-hidden="true" />
          <p>Rotate your device to landscape to keep sailing.</p>
        </div>
      )}
    </section>
  );
}
