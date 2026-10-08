import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import type { EndReason, GameConfig } from '@pirate/game-core';
import { audio } from '../../game/audio/AudioManager';
import { GAME_SOUNDS, GameAudio, LOW_HEALTH_RATIO } from '../../game/audio/GameAudio';
import { loadGameAssets, type GameAssets } from '../../game/assets/loadGameAssets';
import { GameSession, type MatchOutcome } from '../../game/session/GameSession';
import { installTestHooks } from '../../game/session/testHooks';
import { testMode } from '../../lib/testMode';
import { useMatchStore } from '../../store/matchStore';
import { useSettingsStore } from '../../store/settingsStore';
import { announce } from '../components/announcer';
import { Dialog } from '../components/Dialog';
import { FullscreenToggle } from '../components/FullscreenToggle';
import { GameButton } from '../components/GameButton';
import { Panel } from '../components/Panel';
import { Countdown } from './Countdown';
import { countdownSecond } from './countdownTime';
import { Hud } from './Hud';
import { ObscureWatcher, type ScreenCircle } from './obscure';
import { TouchControls } from './TouchControls';
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

/**
 * Delay between the final blow and the result screen: the banner lands and the
 * sea keeps moving, then the battle cross-fades into the result (App).
 */
const END_DELAY_MS = 1900;
/** Get-ready seconds between leaving the pause menu and play resuming. */
const RESUME_COUNTDOWN_S = 3;
/** How often HUD elements check for ships underneath (same rate as the HUD). */
const OBSCURE_INTERVAL_MS = 100;
const PORTRAIT_QUERY = '(orientation: portrait) and (pointer: coarse)';

export function GameScreen({ config, seed, onEnd, onExit }: GameScreenProps) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading', progress: 0 });
  const [attempt, setAttempt] = useState(0);
  /** Asking before abandoning the battle from the pause menu. */
  const [confirmingExit, setConfirmingExit] = useState(false);
  /** Seconds left before play resumes after the pause menu; null when not counting. */
  const [resumeIn, setResumeIn] = useState<number | null>(null);
  const [ended, setEnded] = useState<EndReason | null>(null);
  const [portrait, setPortrait] = useState(() => window.matchMedia(PORTRAIT_QUERY).matches);
  const screenRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<GameSession | null>(null);
  const notifyEnd = useEffectEvent((outcome: MatchOutcome) => onEnd(outcome));

  const hud = useMatchStore((s) => s.hud);
  const paused = useMatchStore((s) => s.paused);
  useMatchAnnouncements(hud, paused);

  // 1. Load (or reuse) textures with progress and retry. Sounds load afterwards
  //    (and only when sound is on), so they never compete with or block the battle.
  useEffect(() => {
    let cancelled = false;
    loadGameAssets((progress) => {
      // Progress never overrides a terminal state (error/ready).
      if (!cancelled)
        setLoad((prev) => (prev.status === 'loading' ? { status: 'loading', progress } : prev));
    })
      .then((assets) => {
        if (!cancelled) setLoad({ status: 'ready', assets });
        if (!useSettingsStore.getState().muted) void audio.preload(GAME_SOUNDS);
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
    const screen = screenRef.current;
    if (!assets || !container || !screen) return;

    useMatchStore.getState().reset();
    let endTimer: number | undefined;
    let sound: GameAudio | null = null;
    // HUD elements and touch clusters fade while a ship is underneath them.
    const watcher = new ObscureWatcher(screen);
    const circles: ScreenCircle[] = [];
    let lastObscureAt = -Infinity;
    const manualClock = testMode.enabled && testMode.clock === 'manual';
    const checkObscured = () => {
      const now = performance.now();
      // The manual (test) clock renders on demand: check every frame there.
      if (!manualClock && now - lastObscureAt < OBSCURE_INTERVAL_MS) return;
      lastObscureAt = now;
      watcher.update(session.getShipScreenCircles(circles));
    };
    const session = new GameSession(
      {
        config,
        seed,
        assets,
        // Snapshot: changing the ship mid-battle applies to the next one.
        playerLook: useSettingsStore.getState().shipLook,
        clock: testMode.enabled ? testMode.clock : 'realtime',
      },
      {
        onHud: (h) => useMatchStore.getState().setHud(h),
        onPauseChange: (p, reason) => {
          useMatchStore.getState().setPaused(p, reason);
          if (p) sound?.pause();
          else sound?.resume();
        },
        onEvents: (events) => sound?.handle(events),
        onFrame: () => {
          sound?.update();
          checkObscured();
        },
        onEnd: (outcome) => {
          setEnded(outcome.endReason);
          endTimer = window.setTimeout(() => notifyEnd(outcome), END_DELAY_MS);
        },
      },
    );
    sound = new GameAudio(session.world);
    sessionRef.current = session;
    const uninstallTestHooks = testMode.enabled ? installTestHooks(session) : null;

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
      watcher.dispose();
      uninstallTestHooks?.();
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
  // Resuming counts down 3-2-1 (with a tick each second) so the player can get ready.
  const resume = useCallback(() => {
    setConfirmingExit(false);
    setResumeIn(RESUME_COUNTDOWN_S);
  }, []);

  useEffect(() => {
    if (resumeIn === null || resumeIn === 0) return;
    audio.synth(resumeIn === 1 ? 'countdown_final' : 'countdown_tick', { volume: 0.8 });
    const timer = window.setTimeout(() => {
      if (resumeIn > 1) {
        setResumeIn(resumeIn - 1);
      } else {
        setResumeIn(null);
        sessionRef.current?.resume();
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [resumeIn]);

  // Esc / P toggle pause while this screen is active.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Escape' && event.code !== 'KeyP') return;
      const session = sessionRef.current;
      if (!session || session.isEnded || event.repeat) return;
      event.preventDefault();
      if (resumeIn !== null) {
        // Esc during the get-ready count goes back to the pause menu.
        if (event.code === 'Escape') setResumeIn(null);
      } else if (!session.isPaused) {
        session.pause('manual');
      } else if (confirmingExit) {
        // Esc backs out of the confirmation, not out of the pause.
        setConfirmingExit(false);
      } else if (!window.matchMedia(PORTRAIT_QUERY).matches) {
        resume();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [resume, confirmingExit, resumeIn]);

  const live = load.status === 'ready' && hud && !ended ? hud : null;
  const countdown = live ? countdownSecond(live) : null;
  // Same red pulse as the countdown, for as long as the ship is badly hurt.
  const lowHealth = !!live && live.hp > 0 && live.hp / live.maxHp <= LOW_HEALTH_RATIO;

  return (
    <section ref={screenRef} className="game-screen" aria-label="Battle">
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

      {lowHealth && (
        <div
          className={`danger-vignette ${paused ? 'is-paused' : ''}`}
          aria-hidden="true"
          data-testid="low-health"
        />
      )}
      {countdown !== null && <Countdown second={countdown} paused={paused} />}

      {ended && (
        <div className={`end-sequence end-sequence--${ended}`} aria-hidden="true">
          <div className="end-banner">
            <span className="end-banner__title">
              {ended === 'timeUp' ? 'Time is up!' : 'Your ship sank!'}
            </span>
            <span className="end-banner__sub">
              {ended === 'timeUp' ? 'The battle is over' : 'Abandon ship!'}
            </span>
          </div>
        </div>
      )}

      {paused && !ended && !portrait && resumeIn !== null && resumeIn > 0 && (
        <div className="resume-countdown" aria-live="assertive" data-testid="resume-countdown">
          <span key={resumeIn} className="countdown__number">
            {resumeIn}
          </span>
        </div>
      )}

      {paused && !ended && !portrait && resumeIn === null && (
        // Re-keyed so each view moves focus to its own default button.
        <Dialog
          key={confirmingExit ? 'exit' : 'pause'}
          titleId="pause-title"
          className="dialog-roomy"
          describedBy="pause-desc"
        >
          {confirmingExit ? (
            <>
              <h2 id="pause-title" className="panel-title">
                Leave the battle?
              </h2>
              <p id="pause-desc" className="tagline">
                This battle will not be recorded.
              </p>
              <div className="menu-actions discard-actions">
                <GameButton onClick={() => setConfirmingExit(false)} data-autofocus>
                  Keep playing
                </GameButton>
                <GameButton variant="secondary" sound="ui_back" onClick={onExit}>
                  Leave
                </GameButton>
              </div>
            </>
          ) : (
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
                <GameButton sound="ui_open" onClick={() => setConfirmingExit(true)}>
                  Main menu
                </GameButton>
              </div>
              <FullscreenToggle size={44} />
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
