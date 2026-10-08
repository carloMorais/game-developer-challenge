import { enterBattleFullscreen } from '../../lib/fullscreen';
import { GameButton } from './GameButton';
import type { GateState } from './useGateState';

/** Covers the screen until the phone is fullscreen and in landscape. */
export function LandscapeGate({ state }: { state: GateState }) {
  if (state === 'open') return null;
  return (
    <div className="rotate-overlay" role="alert" data-testid="landscape-gate">
      {state === 'fullscreen' ? (
        <>
          <p>Battles are played in fullscreen.</p>
          <GameButton onClick={enterBattleFullscreen} data-autofocus>
            Go fullscreen
          </GameButton>
        </>
      ) : (
        <>
          <div className="rotate-overlay__icon" aria-hidden="true" />
          <p>Rotate your device to landscape to keep sailing.</p>
        </>
      )}
    </div>
  );
}
