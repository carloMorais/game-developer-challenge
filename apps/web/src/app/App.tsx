import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_GAME_CONFIG,
  applyDifficulty,
  createMatchConfig,
  gradeMatch,
  resolveMatchSetup,
  totalKills,
  type Difficulty,
  type GameConfig,
  type MatchOptions,
} from '@pirate/game-core';
import { UI_SOUNDS, audio } from '../game/audio/AudioManager';
import { GAME_SOUNDS } from '../game/audio/GameAudio';
import type { MatchOutcome } from '../game/session/GameSession';
import { enterBattleFullscreen, exitBattleFullscreen } from '../lib/fullscreen';
import { randomId } from '../lib/storage';
import { testMode } from '../lib/testMode';
import { registerMatch } from '../data/registration';
import { useProgressStore } from '../store/progressStore';
import { toRecordInput, useResultStore, type MatchResult } from '../store/resultStore';
import { useSettingsStore } from '../store/settingsStore';
import { LandscapeGate } from '../ui/components/LandscapeGate';
import { LiveRegion } from '../ui/components/LiveRegion';
import { gateState, useGateState } from '../ui/components/useGateState';
import { NetworkPanel } from '../ui/dev/NetworkPanel';
import { CaptainsLogScreen } from '../ui/screens/CaptainsLogScreen';
import { DifficultyScreen } from '../ui/screens/DifficultyScreen';
import { MenuScreen } from '../ui/screens/MenuScreen';
import { OptionsScreen } from '../ui/screens/OptionsScreen';
import { ResultScreen } from '../ui/screens/ResultScreen';
import { navigate, parseRoute, useRoute, type Route } from './router';

// PixiJS is only needed in combat: keep it out of the menu bundle.
const GameScreen = lazy(() =>
  import('../ui/game/GameScreen').then((m) => ({ default: m.GameScreen })),
);

/**
 * Test-only base config: `?test=1&noSpawns=1` for isolated movement checks,
 * `?test=1&sturdy=1` so profiling matches always run to time-up.
 */
function baseConfig(): GameConfig {
  let config = DEFAULT_GAME_CONFIG;
  if (testMode.noSpawns) {
    config = { ...config, spawn: { ...config.spawn, initialDelay: 1e9 } };
  }
  if (testMode.sturdy) {
    config = { ...config, player: { ...config.player, maxHp: 1_000_000 } };
  }
  return config;
}

interface PendingMatch {
  key: string;
  config: Readonly<GameConfig>;
  difficulty: Difficulty;
  options: MatchOptions;
  seed: number;
}

/** Elements that play the hover sound. */
const HOVER_TARGETS = 'button, [role="tab"], .swatch, .hull-choice';

/** Phones stay fullscreen and in landscape on these screens. */
const BATTLE_ROUTES = new Set<Route['name']>(['setup', 'play', 'result']);

/** Battle fade-out / result fade-in (CSS `crossfade-*`). */
const CROSSFADE_MS = 700;

function prefersStill(): boolean {
  return testMode.enabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function newMatchSeed(): number {
  const fromUrl = Number(new URLSearchParams(window.location.search).get('seed'));
  return Number.isInteger(fromUrl) && fromUrl > 0 ? fromUrl : Math.floor(Math.random() * 2 ** 31);
}

export function App() {
  const route = useRoute();
  const [match, setMatch] = useState<PendingMatch | null>(null);
  const lastResult = useResultStore((s) => s.lastResult);
  const muted = useSettingsStore((s) => s.muted);
  /** Key of a finished battle still fading out over the result screen. */
  const [leaving, setLeaving] = useState<string | null>(null);
  const leavingRef = useRef<string | null>(null);
  const gate = useGateState();

  useEffect(() => {
    audio.setMuted(muted);
    // Sounds are fetched lazily; turning sound on mid-battle loads them then.
    if (!muted) void audio.preload(UI_SOUNDS);
    if (!muted && route.name === 'play') void audio.preload(GAME_SOUNDS);
  }, [muted, route.name]);

  // Every button answers a hover with a soft tick (mouse only; touch has no hover).
  useEffect(() => {
    const onOver = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const target = event.target instanceof Element ? event.target.closest(HOVER_TARGETS) : null;
      if (!target || target.matches(':disabled, [aria-disabled="true"]')) return;
      // Moving between a button's children is not a new hover.
      const from =
        event.relatedTarget instanceof Element ? event.relatedTarget.closest(HOVER_TARGETS) : null;
      if (from !== target) audio.play('ui_hover', { volume: 0.35 });
    };
    // Buttons without their own click sound (tabs, pagination, toggles...).
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest(HOVER_TARGETS) : null;
      if (target && !target.closest('[data-sfx]')) audio.play('ui_click', { volume: 0.6 });
    };
    window.addEventListener('pointerover', onOver);
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('pointerover', onOver);
      window.removeEventListener('click', onClick);
    };
  }, []);

  // Browsers allow audio only after a user gesture.
  useEffect(() => {
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // A battle cannot be resumed after a reload or by URL: send the player home.
  // Same for a result route without a stored result.
  const invalid = (route.name === 'play' && !match) || (route.name === 'result' && !lastResult);
  useEffect(() => {
    if (invalid) navigate({ name: 'menu' }, { replace: true });
  }, [invalid]);

  // Leaving the battle route abandons the match (nothing is recorded).
  // (Going "forward" in history must not restart it either.)
  useEffect(() => {
    const onHashChange = () => {
      if (parseRoute(window.location.hash).name !== 'play' && !leavingRef.current) setMatch(null);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useScreenFocus(route);

  // Fullscreen lasts from Play through the battle and Play again; other screens leave it.
  useEffect(() => {
    if (!BATTLE_ROUTES.has(route.name)) exitBattleFullscreen();
  }, [route.name]);

  const play = (difficulty: Difficulty) => {
    const settings = useSettingsStore.getState();
    enterBattleFullscreen();
    // Phones start only fullscreen and in landscape (the gate covers the screen).
    if (gateState() !== 'open') return;
    // Never start a locked difficulty (e.g. stale saved choice): fall back to Easy.
    const chosen = useProgressStore.getState().isUnlocked(difficulty) ? difficulty : 'easy';
    settings.setDifficulty(chosen);
    leavingRef.current = null;
    setLeaving(null);
    // Snapshot of the current settings; later changes only affect new matches.
    const setup = resolveMatchSetup(chosen, settings.options);
    setMatch({
      key: randomId(),
      config: createMatchConfig(setup.options, applyDifficulty(baseConfig(), setup.modifiers)),
      difficulty: chosen,
      options: setup.options,
      seed: newMatchSeed(),
    });
    navigate({ name: 'play' }, { replace: route.name === 'result' || route.name === 'setup' });
  };

  const finish = (outcome: MatchOutcome) => {
    if (!match) return;
    const { playerId, playerName } = useSettingsStore.getState();
    const maxHp = match.config.player.maxHp;
    const grade = gradeMatch({
      kills: totalKills(outcome.stats),
      endReason: outcome.endReason,
      hpRatio: outcome.hp / maxHp,
      config: match.config,
    });
    const unlocked = useProgressStore
      .getState()
      .recordMatch(match.difficulty, grade, outcome.endReason);
    const result: MatchResult = {
      matchId: randomId(),
      playerId,
      playerName,
      score: outcome.score,
      durationMs: Math.round(outcome.elapsedMs),
      endReason: outcome.endReason,
      endedAt: new Date().toISOString(),
      difficulty: match.difficulty,
      options: match.options,
      seed: outcome.seed,
      grade,
      stats: outcome.stats,
      hp: Math.ceil(outcome.hp),
      maxHp,
      unlocked,
    };
    useResultStore.getState().setLastResult(result);
    // Persisted and sent in the background; the player can keep playing.
    void registerMatch(toRecordInput(result));
    // The battle stays mounted while it fades out and the result fades in.
    const key = match.key;
    leavingRef.current = key;
    setLeaving(key);
    window.setTimeout(
      () => {
        if (leavingRef.current === key) leavingRef.current = null;
        setLeaving((current) => (current === key ? null : current));
        setMatch((current) => (current?.key === key ? null : current));
      },
      prefersStill() ? 0 : CROSSFADE_MS,
    );
    navigate({ name: 'result' }, { replace: true });
  };

  function renderRoute() {
    if (invalid) return null;
    switch (route.name) {
      case 'menu':
        return <MenuScreen />;
      case 'setup':
        return <DifficultyScreen onStart={play} />;
      case 'options':
        return <OptionsScreen />;
      case 'log':
        return <CaptainsLogScreen tab={route.tab} />;
      case 'result':
        return (
          lastResult && (
            <div className="screen-crossfade-in">
              <ResultScreen result={lastResult} onPlayAgain={() => play(lastResult.difficulty)} />
            </div>
          )
        );
      case 'play':
        return null;
    }
  }

  function renderBattle() {
    const showing = match && (route.name === 'play' || leaving === match.key);
    if (!showing || invalid) return null;
    return (
      <div className={leaving === match.key ? 'game-leaving' : undefined}>
        <Suspense
          fallback={
            <main className="screen" role="status">
              Loading the fleet…
            </main>
          }
        >
          <GameScreen
            key={match.key}
            config={match.config}
            seed={match.seed}
            onEnd={finish}
            onExit={() => navigate({ name: 'menu' })}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <>
      <LiveRegion />
      {renderRoute()}
      {renderBattle()}
      {/* The battle screen draws its own gate, so it can pause first. */}
      {(route.name === 'setup' || route.name === 'result') && <LandscapeGate state={gate} />}
      {/* Kept off the battle screen so it never covers the HUD or touch controls. */}
      {route.name !== 'play' && <NetworkPanel />}
    </>
  );
}

/** Moves focus into each new screen so keyboard and screen-reader users land on it. */
function useScreenFocus(route: Route): void {
  const key = route.name;
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (document.querySelector('[role="dialog"]')) return;
      const target =
        document.querySelector<HTMLElement>('main [data-autofocus]') ??
        document.querySelector<HTMLElement>('main h1');
      if (!target) return;
      if (target.tagName === 'H1') target.tabIndex = -1;
      target.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [key]);
}
