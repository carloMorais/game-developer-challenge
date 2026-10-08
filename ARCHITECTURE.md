# Architecture

This document describes how Pirate Battle is put together and why. The setup and usage guide is in [`README.md`](README.md); the brief is in [`docs/CHALLENGE.md`](docs/CHALLENGE.md).

## Overview

```
┌──────────────────────────── apps/web ─────────────────────────────┐
│                                                                    │
│  React (menus, Options, HUD, dialogs, Result, Captain's Log)       │
│     │  props / callbacks              ▲ HUD snapshots (≤10 Hz),    │
│     ▼                                 │ pause / end callbacks      │
│  GameSession ── one per match ────────┘                            │
│     ├─ InputState  ◄── keyboard / touch (only while live)          │
│     ├─ FixedStepLoop (60 Hz) ──► @pirate/game-core  stepWorld()    │
│     ├─ WorldView (PixiJS)  ◄── reads world + events, never writes  │
│     └─ GameAudio           ◄── reads events                        │
│                                                                    │
│  Data layer: repositories (Axios) ◄── TanStack Query hooks          │
│     └─ registration queue (localStorage) ── PUT /api/matches/:id    │
│                                                                    │
│  MSW worker: handlers + scenarios + mock DB (localStorage)         │
└────────────────────────────────────────────────────────────────────┘
        packages/game-core   simulation, no DOM / Pixi / React
        packages/contracts   DTOs, validation, ranking order
        apps/server          Fastify skeleton (future REST + WS)
```

The split follows the brief's request for separate **rules**, **rendering**, **input** and **UI state**:

| Layer     | Lives in                                   | Knows about                           |
| --------- | ------------------------------------------ | ------------------------------------- |
| Rules     | `packages/game-core`                       | nothing outside itself                |
| Rendering | `apps/web/src/game/render`                 | the world (read-only) and its events  |
| Input     | `apps/web/src/game/input`                  | DOM events → intents                  |
| Session   | `apps/web/src/game/session/GameSession.ts` | wires the three above, owns lifecycle |
| UI state  | `apps/web/src/store` (Zustand) and React   | snapshots, never the live world       |

ESLint enforces the first boundary: `game-core` may not import `pixi.js`, `react` or touch `window`, `document`, `navigator` or `localStorage`.

## Simulation (`packages/game-core`)

### World and systems

The world is plain, serializable data: ships, projectiles, arena, match status, score, spawn timer, a tick counter, the RNG state (Mulberry32, a single 32-bit number) and a queue of events. Entities have stable numeric ids and an `ownerId`/`team`; systems iterate over ships instead of special-casing "the player" wherever possible.

`stepWorld(world, dt)` runs one fixed step, in this order:

1. **AI** writes intents for enemy ships (the player's intents come from input via `applyCommand`).
2. **Movement** integrates heading (turn rate) and forward speed (acceleration / deceleration).
3. **Collisions** resolve ship-vs-ship contacts, then push hulls out of islands and keep them inside the arena.
4. **Weapons** tick cooldowns and fire every slot whose trigger is held and ready.
5. **Projectiles** move, hit, expire or leave the arena.
6. Orphan projectiles (owner destroyed) are removed and dead ships are dropped.
7. **Spawn** counts down the interval and places a new enemy.
8. **Match rules** end the match on time-up; death ends it from inside the damage code.

Once the match has ended every system is a no-op: no movement, firing, damage, spawns or scoring.

### Time

`FixedStepLoop` is an accumulator: real elapsed time goes in and whole 1/60 s steps come out. Each frame's input is clamped to 250 ms, so a tab hitch cannot cause a spiral of catch-up steps. The leftover fraction (`alpha`) is handed to the renderer to interpolate poses between the last two steps. Movement, cooldowns, projectile range, spawn intervals and the match clock all derive from `dt`, so results do not depend on the display's frame rate (60 Hz and 144 Hz screens simulate the same match).

Pausing simply means not calling `stepWorld`. On resume the accumulator is reset and held input is cleared, so the paused period never turns into extra movement, time or shots.

### Collisions

- **Ship hulls** are three circles along the heading (bow, centre, stern; offsets and radius per ship type in the config). They follow the elongated sprites far better than one circle and stay cheap.
- **Islands** are rounded rectangles (circles are the `w = h = 2r` case). `circleVsRoundedRect` returns the push-out vector.
- **Ship vs island / arena edge:** up to three resolve iterations push every hull circle out along the deepest penetration. Head-on rams lose most of their speed; glancing contacts slide along the coast.
- **Ship vs ship:** the deepest contact between hull circles separates both ships half-way each. A **Chaser** touching the player instead explodes: it is removed (no score) and deals its impact damage once.
- **Projectiles** use a swept segment test (previous → current position) against hull circles, so fast shots never tunnel through a ship. They are removed in the same tick they hit a ship, hit an island, leave the arena or travel past their range. Damage is applied exactly once and only to the opposing team.
- Island and bounds resolution runs **after** ship separation, so pushing two ships apart can never leave one inside an island.

### Enemies and spawning

- **Chaser:** steers straight at the player, avoiding obstacles, at full throttle.
- **Shooter:** closes in until it is within `preferredRange` with line of sight, then holds position and turns its bow towards the player. It fires only when the player is within `attackRange`, visible (the segment does not cross an island) and the aim error is below `aimTolerance`.
- **Obstacle avoidance:** both use feelers. They probe the desired heading first, then alternating offsets (±0.45, ±0.9, … rad) and take the first path clear of islands and arena edges.
- **Spawning:** an enemy appears every `spawn.interval` seconds of active play while fewer than `maxAlive` are on the water. The first two spawns follow `openingSequence` (Chaser, then Shooter), so both types always show up in a default match. After that the type is a weighted roll. A spawn point is a seeded random candidate that must be clear of islands (plus clearance) and of other ships, and at least `minDistanceFromPlayer` (380 px) away from the player. If 40 candidates fail, the spawn is **skipped** rather than placed unsafely. New ships face the player.

### Determinism

Every random decision in the simulation uses the world's seeded RNG. Visual effects use a separate RNG seeded from the match seed. With the same seed and the same input per tick, a match replays identically, which the E2E suite and the unit tests rely on.

## React ↔ PixiJS integration

### GameSession

`GameScreen` (React) mounts one `GameSession` per match. The session owns the world, the Pixi `Application`, the input capture, the window listeners and the frame loop. React never touches the world; the session talks back through callbacks:

| Callback        | When                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `onHud`         | Throttled to 100 ms (10 Hz), forced on HUD-relevant events (hit, kill, end). Identical snapshots are skipped, e.g. while paused |
| `onPauseChange` | Manual pause, window blur, hidden tab, portrait orientation; resume                                                             |
| `onEvents`      | Raw simulation events once per frame batch (sound)                                                                              |
| `onEnd`         | Once, with score, effective duration, end reason, seed and config                                                               |

The HUD snapshot goes into a small Zustand store (`matchStore`). Only the HUD and the screen-reader announcer subscribe to it, so React renders at most about ten times a second during combat, never per frame. The continuous state of combat (positions, velocities, cooldowns) only exists in the simulation.

`useMatchAnnouncements` turns snapshot changes into discrete live-region messages: battle start, score (debounced by 2.5 s), 60/30/10 seconds left, health thresholds, pause/resume and the outcome.

### Lifecycle and Strict Mode

- `mount()` is async because `Application.init()` is async. If `destroy()` runs while `init()` is still pending (React Strict Mode mounts, unmounts and mounts again in development), `mount()` notices the `destroyed` flag after the `await` and tears down the half-built app instead of attaching it.
- `destroy()` is idempotent. It detaches the keyboard, runs every registered cleanup (ticker callback, renderer `resize` listener, `visibilitychange`, `blur`), destroys the `WorldView` (sprites, pools, generated textures) and destroys the Pixi app with its canvas. Shared atlas textures are kept for the next match.
- The React effect's cleanup also clears the end-of-match timer, the media-query listener, the test hooks and the sound loops.
- A new match is a new React `key`, so restarting always builds a fresh world, view and session: HP, score, timer and entities are reset by construction.
- Leaving the battle route (menu, back button, reload) unmounts `GameScreen`. Nothing is registered for an abandoned match.

The 5-cycle memory run in [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md) checks this end to end: no canvas, test hook or event listener survives a match.

### Rendering (`WorldView`)

- Layers, bottom to top: water, wakes/splashes/wrecks, islands, arena frame, ships, projectiles, explosions/smoke, castaways, health bars.
- Each frame `sync(alpha)` mirrors the world into display objects. A `ShipView` is created the first time a ship id appears and destroyed when it disappears. Poses are interpolated between the previous and current tick.
- **Ships are assembled from atlas parts** (`ShipView`, `SHIP_LAYOUT` in `theme.ts`) instead of the pack's prebuilt `ship_*` sprites. Z-order: hull → cannons → small sail → main sail → pennant → fire. Hull, sail and flag frames follow the damage state (intact above 2/3 HP, damaged, badly damaged with deck fire, sinking wreck). `cannon_loose` guns sit on the foredeck (bow gun) and amidships (broadsides). Enemies keep fixed colours (Chaser red, Shooter black); the player's look comes from the ship designer.
- **Ship customisation** (`game/shipLook.ts`): sail colour, pennant colour and large or small hull, persisted in `settingsStore` (`shipLook`) and passed through `GameSession` to `WorldView` as `playerLook`. The Options form previews it in the DOM (`ShipPreview`, which reads the source XML atlas).
- Feedback: muzzle flash per cannon (three along a broadside), hit flash, small explosion and debris on damage, double explosion and sinking wreck on destruction, splash when a shot expires on water, smoke when it hits an island. Screen shake scales with the event (strong when the player dies, medium for Chaser impacts, light otherwise). Every ship has a health bar that does not rotate with it.
- **Hits** rock the ship (a decaying roll plus a jolt). **Sinking** drops castaways (`crew_*` sprites) into the water: 1–3 for enemies, 1 for the player (`WorldView.dropCastaways`, `EffectsLayer.castaway`).
- Effect timing uses the session's render clock, which stops while paused, so effects freeze with the game.
- **Wakes** react to how the ship moves. Foam is released with part of the ship's velocity and loses it with exponential drag, so while cruising the hull outruns it and two streaks open into a V over a darker channel, with bow spray at speed. `WorldView` samples each ship's speed to detect acceleration. Braking releases a bow wave and a following sea that keep their momentum and wash past the stopping hull; coming to rest adds a hull-shaped ring and backwash; pulling away kicks foam back from the stern. Idle ships send out slow ripples. Wake sprites have their own budget, so they never take slots from combat effects.
- **Reload feedback** lives on the ship's own cannons: after firing, a gun runs in towards the centre line, drops to 55 % alpha and puffs light smoke (`EffectsLayer.reloadSmoke`) until it is loaded, then runs out again. Each side also has its own reload sound (panned left or right, different pitch), skipped while the trigger is held because the gun fires straight away.

### Canvas fitting and pixel density

The world is a fixed 1280×720 logical arena. `fitViewport` scales it uniformly to the available area and centres it (letterbox), and the water extends into the margins so the letterbox reads as open sea. The Pixi renderer uses `resizeTo` the container, `autoDensity` and `resolution = min(devicePixelRatio, 2)`, which gives sharp output on HiDPI screens with a bounded fill-rate cost. Touch devices use the full screen too (no reserved gutters): the translucent buttons are laid over the sea, and HUD elements fade when a ship is underneath (below). Arena limits and rules never depend on the screen size; resizing or rotating only changes the camera transform.

### HUD fade, fullscreen and PWA

- **HUD fade:** `GameSession.getShipScreenCircles()` maps every ship's hull circles to screen pixels with the current viewport transform. At the HUD rate (10 Hz; every frame under the manual test clock) an `ObscureWatcher` compares them with the cached rects of the `[data-obscurable]` elements (health, score, timer, pause, both touch clusters) and toggles `data-obscured`; CSS does the fading. Rects are measured once and again only after a resize (`ResizeObserver` / window resize), and no React render happens per frame. All of it lives on the render side, not in `game-core`.
- **Fullscreen:** `lib/fullscreen.ts` wraps the standard and WebKit APIs; every call is try/catch and never blocks a match. **Set sail** / **Play again** call it from their click handlers (fullscreen needs a user gesture) on coarse pointers when `autoFullscreen` is on, then try `screen.orientation.lock('landscape')`. The app leaves that fullscreen when the player returns to a menu screen, keeps it across Play again, and never re-enters it automatically after the system back gesture.
- **PWA:** `public/manifest.webmanifest` (fullscreen, landscape, icons in `public/icons/`) makes the game installable. There is deliberately no caching service worker: MSW registers `mockServiceWorker.js` at the root scope and a second worker would conflict with it.

### Input

`InputState` keeps the held actions per source (keyboard, touch), so releasing a touch button never cancels a key that is still held, and vice versa. Every fixed step turns them into `ShipIntents` (`throttle`, `turn`, three fire triggers) through `applyCommand`, a tick-stamped command that a network layer could later send as is. The keyboard listener is attached only while the battle is live and detached on pause, end and destroy. It uses `event.code`, so bindings do not depend on the keyboard layout, and it only calls `preventDefault` for bound keys. Touch buttons use pointer events with pointer capture, one pointer per button, so several can be held at once.

## Resource management

- **Textures:** three atlases (`ships`, `tiles`, `ui`) are generated at build time from `assets/` by `scripts/build-assets.mjs`. It converts the ships' Starling XML to Pixi JSON, cuts the 64×64 tilesheet into a grid atlas and re-points the UI atlas. `loadGameAssets` loads them once through `Assets.load` with progress reporting and caches the result for the rest of the session. If an atlas fails, its URL is unloaded so **Try again** fetches it afresh instead of reusing a rejected promise. The battle starts only once every atlas has loaded.
- **Pools:** projectile sprites and effect sprites are pooled and reused instead of allocated per shot or explosion. Textures generated at runtime (soft dot, ring and a radial-gradient foam blob) belong to the `EffectsLayer` and are destroyed with it.
- **Code splitting:** PixiJS and the battle screen are a lazy chunk, so the menus load without the renderer.
- **Sound:** 27 WAV files decoded through Web Audio by `AudioManager`, cached after the first load. They load after the textures and only when sound is on, so audio never delays or blocks a battle. The same sound retriggered within a short window is dropped to avoid volume spikes. Loops (ocean, sailing) stop with the session. Cues the pack has no file for (countdown beeps, reload clicks, fanfare, grade stamp, unlock) are synthesised with oscillators and filtered noise in `synth.ts`, so they need no assets.

## Local persistence

All keys are namespaced and versioned (`pirate-battle:*:vN`, bumped when a shape changes so stale data is ignored), and storage access never throws: private mode or quota errors degrade to "not stored".

| Key                   | Contents                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `settings:v1`         | `playerId` (UUID created on first visit), player name, custom options, mute, chosen difficulty, How to play open/closed |
| `progress:v1`         | Hardest unlocked difficulty and best grade per difficulty                                                               |
| `last-result:v2`      | Last completed match with grade and stats (shown on `#/result`, survives refresh)                                       |
| `pending-matches:v2`  | Completed matches not yet confirmed by the API (entries that no longer validate are dropped)                            |
| `recorded-matches:v1` | Ids recently confirmed (so the result screen shows "recorded")                                                          |
| `mock-db:v2`          | The mock backend's records and revision                                                                                 |
| `mock-network:v1`     | Selected scenario, latency override, seed                                                                               |

Options are validated on load as well as on save, so a stale or tampered value falls back to the defaults.

## Ranking and history

### Contracts (`packages/contracts`)

Plain, serializable DTOs shared by the client, the mocks and (later) the server: `MatchRecordInput` (`matchId`, `playerId`, `playerName`, `score`, effective `durationMs`, `endReason`, `grade`, `endedAt`, `config` with `difficulty`, `sessionTime` and `spawnInterval`), `MatchRecord` (adds `recordedAt`), `RankingEntry`, `Page<T>` and an error body. The package also has runtime validation (`parseMatchRecordInput`, `parsePagination`, `parseMatchConfig`), pagination, and the ranking order `compareRanking`: **score desc → duration asc → `endedAt` asc → `matchId`**, which is total and deterministic. The ranking only compares matches with the same `configKey` (difficulty + session time + spawn interval; presets always run fixed times, so in practice each preset is one leaderboard). A `CONTRACTS_VERSION` constant is exposed by the server's health route.

| Endpoint                                                              | Purpose                                                                                      |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `GET /api/ranking?difficulty&sessionTime&spawnInterval&page&pageSize` | Leaderboard page for one configuration                                                       |
| `GET /api/ranking/configs`                                            | Configurations that have entries (selector)                                                  |
| `PUT /api/matches/:matchId`                                           | Idempotent create: 201 created, 200 already stored, 409 if the id exists with different data |
| `GET /api/players/:playerId/matches?page&pageSize`                    | Player's history, newest first                                                               |

`PUT` with a client-generated `matchId` makes registration naturally idempotent: resending, double clicks and retries after a timeout all land on the same record.

### Client

- **Axios** (`apiClient`): `/api` base URL, 6 s timeout. `toApiError` normalises failures into `timeout | network | client | server | cancelled` with user-facing messages. Only transient failures (timeout, network, 5xx, 429) are retryable.
- **Repositories** (`RankingRepository`, `MatchRepository`) hide the transport. Hooks and components depend on these interfaces, not on Axios.
- **TanStack Query:** 15 s `staleTime`, two retries with exponential backoff (500 ms, 1 s, capped at 4 s), refetch on window focus and `refetchOnMount: 'always'`, so each tab refreshes when shown again. `keepPreviousData` keeps the current page visible while the next one loads ("Updating…" indicator). Loading, empty, error (with **Try again**) and background refresh are separate UI states.
- **Stale responses:** every page carries the backend's monotonic `revision`. TanStack Query cancels superseded requests for the same key through `AbortSignal`, and `monotonic()` also refuses to replace cached data with a page whose revision is older. Together they ensure a slow, out-of-order response never overwrites newer data.

### Registration and the pending queue

1. When a match ends, `App` saves the result (`last-result`) and calls `registerMatch`. The match is added to the **pending queue in `localStorage` before** the request is sent, so a crash, refresh or closed tab cannot lose it.
2. Registration runs as a TanStack Query mutation with a shared `scope`, so mutations run **one at a time**: repeated clicks queue instead of racing. A match already being sent or already recorded is not sent again.
3. On success the match moves from `pending` to `recorded`. `invalidateMatchLists()` first **cancels** in-flight ranking/history fetches (an in-flight first load would otherwise keep its pre-registration response), then invalidates both, so both tabs show the new match.
4. On failure (after the automatic retries) the entry stays pending with the error message. The result screen shows the state ("Recording your battle…", "Battle recorded…", "Not recorded yet: <reason>…" with **Retry now**). The player can start another match at any time; nothing in the game waits for the network.
5. `flushPendingMatches()` resends the whole queue on app start, when the browser comes back `online` and when the tab becomes visible again.

If the server stored the match but the response was lost (`registerTimeoutAfterCommit`), the retry gets `200 { created: false }` with the existing record, and the match still appears exactly once.

## Mocks (MSW)

- `src/mocks/handlers.ts` implements the four endpoints against `MockDatabase` (`db.ts`). The database is seeded from deterministic fixtures (`fixtures.ts`: other captains across five configurations, the default one spanning several pages) and persists confirmed records plus a monotonic revision in `localStorage`. `reset()` restores the fixtures and **increments** the revision, so clients never mistake restored data for old data.
- Handlers validate input with the shared contract parsers and return the shared error body.
- `scenarios.ts` defines the scenarios (latency per request kind and request number, failure type, data override, timeout-after-commit). The handler reads the active scenario on every request, so switching takes effect immediately. List payloads are built **before** the simulated delay, so a slow response carries the data as it was when the request arrived, which is what makes out-of-order responses realistic.
- Latency randomness uses a seeded RNG (`mockSeed`). Tests set `mockLatency=0`, or a fixed value, for reproducible timing.
- The worker (`mockServiceWorker.js`) is emitted by `msw/vite` in dev **and** in the production build. `main.tsx` awaits `worker.start()` before rendering, so the first query is always intercepted. If service workers are unavailable (some private modes), the game still runs and the two tabs show their error state.
- MSW 3 refreshes an existing registration with a fire-and-forget `registration.update()`. If that check fails (a reload interrupting it, a flaky network) the rejection would surface as an unhandled error, although the current worker keeps serving. `startMocks()` wraps `ServiceWorkerRegistration.prototype.update` so those failures are logged as a warning instead (found while checking the published build).
- Selection and reset: the network panel (`?debug` or Ctrl+Shift+M), URL parameters and `window.__pirateMocks` for tests.

## Test strategy (summary)

- **Unit (Vitest):** `game-core` covers movement, bounds, islands, weapons and cooldowns, projectile lifetime, damage-once, scoring rules, Chaser impact, spawn safety and the opening sequence, match end, pause and the RNG. `contracts` covers validation, pagination and ranking order.
- **E2E (Playwright):** the 12 areas from the brief, against the production build, in desktop and mobile Chromium, with visual baselines (menu, arena, result) for Windows and Linux. `?test=1` gives a manual clock and state reads. Inputs are real keyboard/pointer events and the rules, collisions and rendering run unmodified. Every test starts from a fresh context, and a fixture fails any test that logs an unexpected console error.

## Prepared for a backend and WebSockets

WebSockets are out of scope, but the seams are in place:

- Repositories behind interfaces: a WebSocket-backed implementation could push ranking updates into the Query cache (`setQueryData` / `invalidateQueries`) without touching components.
- Contracts are transport-agnostic, versioned DTOs that can double as WS message payloads.
- Idempotency by `matchId` makes delivery safe to retry on any transport.
- Input is already tick-stamped `InputCommand`s of plain intents, and the simulation is deterministic and serializable with no DOM dependency. `apps/server` can run the same `game-core` for server-authoritative play or replays.
- `apps/server` (Fastify) exists with a health route, so adding REST routes and `@fastify/websocket` is additive.
- MSW can mock WebSocket connections too, so the scenario approach extends to it.

## Balancing decisions

- **Shooter damage is low (8) but steady**, Chaser damage is a burst (20 on impact). Shooters keep pressure from range and reward dodging, while Chasers punish standing still. Five Chaser impacts or about 13 Shooter hits sink the player.
- **Spawns at least 380 px away**, the Shooter's attack range. A new Chaser needs about 3 s to reach the player, and a Shooter at the edge of its range fires a shot that takes about 1 s to arrive and can be dodged, so no new spawn deals unavoidable damage.
- **Opening sequence Chaser → Shooter** guarantees both types appear early in every match, independent of the seed. After that it is 55 / 45.
- **`maxAlive = 8`** keeps short spawn intervals (1 s) intense but readable. Intervals that would exceed the cap simply skip.
- **Broadside vs bow cannon:** the bow cannon is precise and fast (0.4 s); broadsides hit harder in total (3 × 20) but have a shorter range and a 1.3 s cooldown per side, which rewards positioning alongside an enemy.
- **Destroyed enemies' projectiles are removed** together with the ship. The brief says destroyed enemies stop causing damage, so shots still in flight from a sunk Shooter are cleared too.
- **Only kills by the player's weapons score.** A Chaser exploding on the player gives nothing.
- **Difficulties change enemies, never the player**, so skill carries over between them and the grade stays comparable. Presets fix their session and spawn times so each one is a single leaderboard; Custom keeps the Options screen meaningful (and always available, as the brief requires) with the Normal balance.
- **Grades favour surviving well over trading hits.** Health and survival only count when afloat, so dying caps the grade at B and the unlock rule (survive with B or better) cannot be met by a reckless kill spree that sinks the ship.

## Limitations and known trade-offs

- **Retina ship sheet:** the provided "retina" ship atlas has the same size and coordinates as the 1× one, so only the 1× atlas is shipped. HiDPI sharpness for ships comes from the renderer resolution; the UI and tile atlases do ship their retina (`@2x`) sheets.
- **Network timing:** 6 s request timeout and 2 automatic retries. In the `timeout` scenario a failure takes about 20 s to surface (3 × 6 s plus backoff), which is deliberate so short outages recover silently.
- **One arena layout.** Islands are data (`DEFAULT_ARENA`), but there is no map selection.
- **AI steering** uses feelers, not path-finding. It handles the open layout of this arena well, but an enemy can occasionally hug a coastline for a moment before finding the way around.
- **Mobile is landscape-only.** Fullscreen and the landscape lock are best effort (Android Chrome); elsewhere the battle pauses behind a "rotate your device" overlay in portrait. Only Android Chrome was tested on a real device; iOS is best effort.
- **No offline mode.** The PWA manifest makes the game installable, but there is no caching worker: MSW owns the root service-worker scope.
- **Mocks need service workers.** Without them (some private modes) ranking and history show an error; the game itself is unaffected.
- **Sound** is not covered by automated tests (the suite runs muted), and its random pitch variation is not seeded.
- **Performance** was measured on a single reference machine; see [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md) for the environment and caveats.
- **No real backend:** `apps/server` is a skeleton and is not deployed.
