import { Suspense, lazy, useEffect, useState } from 'react';
import { createMatchConfig, type GameConfig, type MatchOptions } from '@pirate/game-core';
import { audio } from '../game/audio/AudioManager';
import type { MatchOutcome } from '../game/session/GameSession';
import { randomId } from '../lib/storage';
import { registerMatch } from '../data/registration';
import { toRecordInput, useResultStore, type MatchResult } from '../store/resultStore';
import { useSettingsStore } from '../store/settingsStore';
import { LiveRegion } from '../ui/components/LiveRegion';
import { NetworkPanel } from '../ui/dev/NetworkPanel';
import { CaptainsLogScreen } from '../ui/screens/CaptainsLogScreen';
import { MenuScreen } from '../ui/screens/MenuScreen';
import { OptionsScreen } from '../ui/screens/OptionsScreen';
import { ResultScreen } from '../ui/screens/ResultScreen';
import { navigate, parseRoute, useRoute, type Route } from './router';

// PixiJS is only needed in combat: keep it out of the menu bundle.
const GameScreen = lazy(() =>
  import('../ui/game/GameScreen').then((m) => ({ default: m.GameScreen })),
);

interface PendingMatch {
  key: string;
  config: Readonly<GameConfig>;
  options: MatchOptions;
  seed: number;
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

  useEffect(() => audio.setMuted(muted), [muted]);

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
      if (parseRoute(window.location.hash).name !== 'play') setMatch(null);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useScreenFocus(route);

  const play = () => {
    const { options } = useSettingsStore.getState();
    // Snapshot of the current options; later changes only affect new matches.
    setMatch({
      key: randomId(),
      config: createMatchConfig(options),
      options: { ...options },
      seed: newMatchSeed(),
    });
    navigate({ name: 'play' }, { replace: route.name === 'result' });
  };

  const finish = (outcome: MatchOutcome) => {
    if (!match) return;
    const { playerId, playerName } = useSettingsStore.getState();
    const result: MatchResult = {
      matchId: randomId(),
      playerId,
      playerName,
      score: outcome.score,
      durationMs: Math.round(outcome.elapsedMs),
      endReason: outcome.endReason,
      endedAt: new Date().toISOString(),
      options: match.options,
      seed: outcome.seed,
    };
    useResultStore.getState().setLastResult(result);
    // Persisted and sent in the background; the player can keep playing.
    void registerMatch(toRecordInput(result));
    navigate({ name: 'result' }, { replace: true });
  };

  function renderRoute() {
    if (invalid) return null;
    switch (route.name) {
      case 'menu':
        return <MenuScreen onPlay={play} />;
      case 'options':
        return <OptionsScreen />;
      case 'log':
        return <CaptainsLogScreen tab={route.tab} />;
      case 'result':
        return lastResult && <ResultScreen result={lastResult} onPlayAgain={play} />;
      case 'play':
        return (
          match && (
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
          )
        );
    }
  }

  return (
    <>
      <LiveRegion />
      {renderRoute()}
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
