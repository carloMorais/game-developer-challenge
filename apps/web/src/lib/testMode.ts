/**
 * Test instrumentation flags, read once from the URL.
 *
 * - `?test=1` exposes `window.__pirate` (state + clock control) and uses a
 *   manual simulation clock, so E2E tests are deterministic. Rules, input,
 *   collisions and rendering still run for real.
 * - `&clock=realtime` keeps the display-driven clock (pause/focus tests).
 * - `&noSpawns=1` disables enemy spawning (isolated movement tests).
 * - `&sturdy=1` gives the player a huge HP pool, so profiling runs last the
 *   whole match (a config change only; damage still applies).
 *
 * Seeds come from `?seed=` (match) and `?mockSeed=` (network mocks).
 */
const params =
  typeof window === 'undefined'
    ? new URLSearchParams()
    : new URLSearchParams(window.location.search);

const enabled = params.get('test') === '1';

export const testMode = {
  enabled,
  clock: params.get('clock') === 'realtime' ? ('realtime' as const) : ('manual' as const),
  noSpawns: enabled && params.get('noSpawns') === '1',
  sturdy: enabled && params.get('sturdy') === '1',
};
