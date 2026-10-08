# Performance report

Profiling of the combat in the optimised production build, as requested by the brief: frame rate, 95th-percentile frame time and entity count over a three-minute match, and memory after repeated start / play / exit cycles.

**Summary:** on the reference laptop (integrated Intel GPU) the game holds the 60 FPS target for whole three-minute matches, including a stress run with the arena at its 8-enemy cap. p95 frame time is 17.0 ms in both runs (p99 17.1 ms). Across the two runs (about 22,000 frames) four frames went over 20 ms, all in the default run, and one of them was a single 83 ms hitch with an 80 ms long task (one dropped-frame stutter in three minutes); the stress run had no frame over 17.3 ms. Re-measured after phase 8 (ship parts, smoke, castaways, HUD fade). Leaving a match releases its canvas, listeners and DOM; after the first match (texture and code warm-up) the JS heap grows by less than 0.1 MB per further cycle and the growth keeps slowing.

## How it was measured

`pnpm perf` runs [`apps/web/tests/perf/performance.spec.ts`](../apps/web/tests/perf/performance.spec.ts) with [`apps/web/playwright.perf.config.ts`](../apps/web/playwright.perf.config.ts):

- The **production build** (`vite build` + `vite preview`) runs in the full Chromium build in new headless mode (Playwright `chromium` channel), which renders with the machine's **GPU** (ANGLE / Direct3D 11), not the software WebGL of the headless shell. One test at a time.
- URL: `?test=1&clock=realtime&sturdy=1`. The simulation runs on the normal display-driven clock. `test=1` only exposes the read-only state used by the probe and the autopilot. `sturdy=1` raises the player's max HP to 1,000,000 (a config value; damage, collisions and every other rule are unchanged), so each run lasts the full three minutes instead of ending when the autopilot sinks.
- **Sound on** (Web Audio playing every effect and both ambient loops).
- An in-page **autopilot** plays by dispatching keyboard events, just like a player:
  - `hunter`: aims at the nearest enemy, fires the bow cannon when aligned and the broadside that bears;
  - `spray`: circles at full speed holding every trigger. It sinks fewer enemies, so the arena stays at the 8-enemy cap with more projectiles in flight (worst case).
- **Frame times** are the deltas between consecutive `requestAnimationFrame` callbacks for the whole run. **Entity counts** (enemies, projectiles, Pixi display objects for ships, projectiles and effects) are sampled once per second. Long tasks come from `PerformanceObserver('longtask')`. Heap usage over time comes from CDP `Runtime.getHeapUsage` every 5 s (no forced GC).
- **Memory cycles:** play 30 s (`spray`, 1 s spawns), pause, go to the main menu; then force two GCs via CDP (`HeapProfiler.collectGarbage`) and read `Performance.getMetrics` (JS heap, DOM nodes, JS event listeners), plus the number of `<canvas>` elements and whether the test hooks are gone.

Raw data: [`reports/performance/`](reports/performance/) (`match-3min-default.json`, `match-3min-stress.json`, `memory-5-cycles.json`, `memory-10-cycles.json`, with per-second samples) and the Playwright HTML report in [`reports/performance/playwright-report/`](reports/performance/playwright-report/index.html).

## Environment

| Item     | Value                                                                       |
| -------- | --------------------------------------------------------------------------- |
| Machine  | Laptop, Intel Core i7-10610U (4 cores / 8 threads, 1.8 GHz base), 32 GB RAM |
| GPU      | Intel UHD Graphics (integrated), ANGLE Direct3D 11                          |
| Display  | 1920×1080 at 60 Hz                                                          |
| OS       | Windows 11 Pro 22H2 (10.0.22621)                                            |
| Browser  | Chromium 153.0.8010.12 (Playwright 1.63, new headless mode)                 |
| Viewport | 1280×720 CSS px, devicePixelRatio 1 (renderer resolution 1)                 |
| Build    | `vite build` (production, minified), served by `vite preview`               |
| Date     | 2026-10-08 (phase 8; first profiled 2026-10-07)                             |

## Results: three-minute matches

Both matches: 180 s session, seed 7, ended by time-up (`durationMs` 180000).

| Metric                          | Default (spawn 3 s, `hunter`) | Stress (spawn 1 s, `spray`) |
| ------------------------------- | ----------------------------- | --------------------------- |
| Frames recorded                 | 11,119 over 185.6 s           | 11,127 over 185.6 s         |
| Average FPS                     | **59.9**                      | **59.9**                    |
| Worst 1-second window           | 55.9 FPS                      | 59.9 FPS                    |
| Frame time p50 / **p95** / p99  | 16.7 / **17.0** / 17.1 ms     | 16.7 / **17.0** / 17.1 ms   |
| Max frame time                  | 83.4 ms                       | 17.3 ms                     |
| Frames > 20 ms / > 33 ms        | 4 / 1                         | 0 / 0                       |
| Long tasks (> 50 ms)            | 1 (80 ms)                     | 0                           |
| Enemies alive, avg / max        | 0.9 / 3                       | 7.1 / 8 (cap)               |
| Projectiles, avg / max          | 0.4 / 6                       | 6.0 / 14                    |
| Pixi display objects, avg / max | 176.1 / 325                   | 437.1 / 714                 |
| Score                           | 49                            | 65                          |
| JS heap during the match        | 9.3 – 17.4 MB (sawtooth)      | 9.9 – 24.0 MB (sawtooth)    |

The "default" run has few enemies at a time because the autopilot sinks them quickly; the stress run keeps the arena at its cap, the heaviest state a real match can reach. Display objects grew about 6× since the first profile: phase 7 assembles every ship from parts and adds smoke, wreckage and castaways; frame time did not move. The single 83 ms hitch in the default run is one frame in three minutes, not a trend; it was not reproduced in the stress run, which has far more objects. The heap series rises and falls with minor GCs in both runs and ends lower than its peak, with no upward trend over the three minutes.

## Results: memory over start / play / exit cycles

After each cycle, with forced GC (`memory-5-cycles.json`, phase 8 build):

| Snapshot          | JS heap used (MB) | DOM nodes | JS listeners | Canvases |
| ----------------- | ----------------- | --------- | ------------ | -------- |
| Menu, before play | 3.96              | 73        | 184          | 0        |
| After cycle 1     | 8.49              | 295       | 221          | 0        |
| After cycle 2     | 8.89              | 295       | 221          | 0        |
| After cycle 3     | 9.18              | 295       | 223          | 0        |
| After cycle 4     | 9.28              | 294       | 221          | 0        |
| After cycle 5     | 9.40              | 295       | 221          | 0        |

The earlier 10-cycle run (`memory-10-cycles.json`, phase 6 build) showed the same shape over ten matches: +1.3 MB in total after the first, slowing each cycle. DOM nodes jump once after the first cycle (73 → 295, versus 164 → 179 in the earlier run) and then stay flat; the one-off jump was not investigated further, but it does not grow with more matches.

Reading:

- **First match (+4.5 MB):** expected one-off cost. The lazily loaded battle chunk (PixiJS), the cached atlases and decoded sounds, and TanStack Query's cache stay in memory on purpose so later matches start instantly.
- **DOM nodes, event listeners and canvases are flat** across cycles (±2, which is focus and live-region churn). No canvas and no `window.__pirate` hook survives a match, so the Pixi application, ticker, keyboard capture, window listeners and timers are all released.
- **Residual heap growth** shrinks each cycle: +0.40, +0.29, +0.10, +0.12 MB for cycles 2–5 (phase 8), and about +0.09 MB per cycle for cycles 5–10 in the earlier 10-cycle run. A leak of match objects (world, sprites, textures, sessions) would add a roughly constant amount per cycle, of the size of a match's state, and would also hold its listeners and canvas. The slowing pattern fits engine warm-up instead (JIT code, inline caches, Pixi's internal pools and caches). We did not diff heap snapshots to attribute every byte, so this explanation is a judgement call, not a proof. At this rate a full evening of play would cost a few MB.

## Lighthouse (mobile)

Lighthouse 12, mobile form factor with its default simulated throttling (slow 4G, 4× CPU), against the production build served locally (`vite preview`), 2026-10-08:

| Category       | Score |
| -------------- | ----- |
| Performance    | 65    |
| Accessibility  | 100   |
| Best practices | 100   |
| SEO            | 100   |

Fixed in phase 8: a missing `robots.txt` (the SPA rewrite returned the HTML) and a preload for the menu backdrop. What keeps Performance at 65 under throttling is start-up cost: about 0.5 s of blocking time (React, TanStack Query and the MSW worker boot before the menu), unused JS in the menu bundle, and PNG art served as delivered (WebP would save about 1.5 MB, but the pack's images are deliberately not re-encoded; see CREDITS). PWA installability is no longer a Lighthouse category; the manifest is served as `application/manifest+json` with 192/512/maskable icons. The deployed preview and the Android install prompt still need a manual check on the device.

## Limitations

- **Frame rate is capped by the 60 Hz display.** The numbers show the target is met with margin (four frames over 20 ms in about 22,000, one of them an 83 ms hitch), not how much headroom there is. A vsync-unlocked run (`--disable-gpu-vsync --disable-frame-rate-limit`) or a CPU profile would quantify the per-frame cost.
- **Headless:** the page is composited without being shown on screen. Real presentation through the desktop compositor can add a little latency, though it does not change the simulation cost.
- **One machine and one resolution** (1280×720 at DPR 1). High-DPI screens render at up to 2× resolution (capped), so fill-rate cost grows about 4× there. Mobile devices were not profiled; mobile Chromium is only covered functionally by the E2E suite (emulated, software WebGL).
- **Autopilot vs human play:** the bots stress the systems in a repeatable way, but they do not reproduce every human pattern (for example long chases around islands).
- `sturdy=1` changes the player's max HP only. The health bar therefore stays full and the damaged ship sprites of the player are not exercised in these runs; enemy damage states are.

## Reproducing

```bash
pnpm perf                                           # all three runs (~9 min), writes docs/reports/performance/
PERF_CYCLES=10 pnpm perf -g memory                  # the longer memory run
```

Close other heavy applications first: the runs are sensitive to background load.
