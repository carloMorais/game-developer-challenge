import { Suspense, lazy, useState } from 'react';
import { DEFAULT_MATCH_OPTIONS, createMatchConfig, type GameConfig } from '@pirate/game-core';
import type { MatchOutcome } from '../game/session/GameSession';
import { formatTime } from '../ui/format';

// PixiJS is only needed in combat: keep it out of the menu bundle.
const GameScreen = lazy(() =>
  import('../ui/game/GameScreen').then((m) => ({ default: m.GameScreen })),
);

type Screen =
  | { name: 'menu' }
  | { name: 'game'; config: Readonly<GameConfig>; seed: number; key: number }
  | { name: 'result'; outcome: MatchOutcome };

function newMatchSeed(): number {
  const fromUrl = Number(new URLSearchParams(window.location.search).get('seed'));
  return Number.isInteger(fromUrl) && fromUrl > 0 ? fromUrl : Math.floor(Math.random() * 2 ** 31);
}

/** Temporary shell: menus and results get their real screens in phase 3. */
export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'menu' });

  const play = () =>
    setScreen({
      name: 'game',
      // Snapshot of the current options; later changes only affect new matches.
      config: createMatchConfig(DEFAULT_MATCH_OPTIONS),
      seed: newMatchSeed(),
      key: Date.now(),
    });

  switch (screen.name) {
    case 'menu':
      return (
        <main className="app">
          <h1>Pirate Battle</h1>
          <button type="button" className="btn btn--primary" onClick={play}>
            Play
          </button>
        </main>
      );
    case 'game':
      return (
        <Suspense
          fallback={
            <main className="app" role="status">
              Loading the fleet…
            </main>
          }
        >
          <GameScreen
            key={screen.key}
            config={screen.config}
            seed={screen.seed}
            onEnd={(outcome) => setScreen({ name: 'result', outcome })}
            onExit={() => setScreen({ name: 'menu' })}
          />
        </Suspense>
      );
    case 'result':
      return (
        <main className="app">
          <h1>{screen.outcome.endReason === 'timeUp' ? 'Time is up!' : 'Your ship sank!'}</h1>
          <p>
            Score {screen.outcome.score} · Time played {formatTime(screen.outcome.elapsedMs)}
          </p>
          <button type="button" className="btn btn--primary" onClick={play}>
            Play again
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => setScreen({ name: 'menu' })}
          >
            Main menu
          </button>
        </main>
      );
  }
}
