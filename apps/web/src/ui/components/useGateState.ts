import { useEffect, useState } from 'react';
import {
  canFullscreen,
  isFullscreen,
  isTouchDevice,
  onFullscreenChange,
} from '../../lib/fullscreen';
import { testMode } from '../../lib/testMode';

const PORTRAIT_QUERY = '(orientation: portrait)';

export type GateState = 'open' | 'fullscreen' | 'rotate';

/**
 * Phones play only fullscreen and in landscape. Fullscreen is skipped where
 * the browser cannot do it (iPhone) and under test (headless cannot enter it).
 */
export function gateState(): GateState {
  if (!isTouchDevice()) return 'open';
  if (!testMode.enabled && canFullscreen() && !isFullscreen()) return 'fullscreen';
  // Compare sizes too: some Android builds report a stale orientation query
  // right after the fullscreen landscape lock.
  if (window.matchMedia(PORTRAIT_QUERY).matches && window.innerHeight > window.innerWidth) {
    return 'rotate';
  }
  return 'open';
}

/** Re-evaluates the gate on every rotation, resize and fullscreen change. */
export function useGateState(): GateState {
  const [state, setState] = useState(gateState);
  useEffect(() => {
    const update = () => setState(gateState());
    const query = window.matchMedia(PORTRAIT_QUERY);
    query.addEventListener('change', update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    screen.orientation?.addEventListener?.('change', update);
    const offFullscreen = onFullscreenChange(update);
    update();
    return () => {
      query.removeEventListener('change', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      screen.orientation?.removeEventListener?.('change', update);
      offFullscreen();
    };
  }, []);
  return state;
}
