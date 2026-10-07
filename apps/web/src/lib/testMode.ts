/**
 * Test instrumentation flags, read once from the URL.
 *
 * - `?test=1` exposes `window.__pirate` (state + clock control) and uses a
 *   manual simulation clock, so E2E tests are deterministic. Rules, input,
 *   collisions and rendering still run for real.
 * - `&clock=realtime` keeps the display-driven clock (pause/focus tests).
 * - `&noSpawns=1` disables enemy spawning (isolated movement tests).
 *
 * Seeds come from `?seed=` (match) and `?mockSeed=` (network mocks).
 */
const params =
  typeof window === 'undefined'
    ? new URLSearchParams()
    : new URLSearchParams(window.location.search);

export const testMode = {
  enabled: params.get('test') === '1',
  clock: params.get('clock') === 'realtime' ? ('realtime' as const) : ('manual' as const),
  noSpawns: params.get('noSpawns') === '1',
};
