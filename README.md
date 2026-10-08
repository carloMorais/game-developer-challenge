# Pirate Battle

A top-down 2D naval shooter built with React, TypeScript (strict) and PixiJS. Sail between islands, sink Chasers and Shooters, and climb the ranking before the clock runs out.

**Play it:** <https://pirategame-iiq5.vercel.app> (add `?debug` for the network scenario panel)

The original challenge brief is in [`docs/CHALLENGE.md`](docs/CHALLENGE.md). Design decisions are in [`ARCHITECTURE.md`](ARCHITECTURE.md), profiling results in [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md) and asset credits in [`CREDITS.md`](CREDITS.md).

| Concern                    | Technology                                                       |
| -------------------------- | ---------------------------------------------------------------- |
| Menus, forms, dialogs, HUD | React 19 (Strict Mode)                                           |
| Game rendering             | PixiJS 8 (WebGL)                                                 |
| Simulation                 | `@pirate/game-core`, plain TypeScript (no DOM, no Pixi)          |
| UI state                   | Zustand                                                          |
| Ranking / history data     | TanStack Query 5 + Axios, typed contracts in `@pirate/contracts` |
| API mocks                  | MSW 3 (development, tests **and** the published build)           |
| E2E and visual regression  | Playwright                                                       |
| Unit tests                 | Vitest                                                           |
| Build                      | Vite 8, pnpm workspaces                                          |

## Setup

Requirements: **Node.js 22+** (see `.nvmrc`) and **pnpm 10** (`corepack enable` picks the version pinned in `package.json`).

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

The runtime atlases, sounds and background are generated from [`assets/`](assets/) into `apps/web/public/game/` by `apps/web/scripts/build-assets.mjs`. It runs automatically before `dev` and `build`.

### Environment variables

None. The app needs no keys, secrets or external services: ranking and history are served by MSW inside the browser. The production build behaves the same way. Test-only switches are URL parameters (see [Test instrumentation](#test-instrumentation)).

## Commands

Run from the repository root.

| Command             | What it does                                                                     |
| ------------------- | -------------------------------------------------------------------------------- |
| `pnpm dev`          | Vite dev server (with MSW) on port 5173                                          |
| `pnpm dev:server`   | Fastify server skeleton (`GET /health` only; not used by the game)               |
| `pnpm build`        | Type-checks and builds `apps/web` into `apps/web/dist`                           |
| `pnpm preview`      | Serves the production build on port 4173                                         |
| `pnpm lint`         | ESLint across the workspace                                                      |
| `pnpm format:check` | Prettier check (`pnpm format` to fix)                                            |
| `pnpm typecheck`    | `tsc` in every package                                                           |
| `pnpm test`         | Vitest unit tests (`game-core` simulation, `contracts` validation and ordering)  |
| `pnpm e2e`          | Playwright E2E + visual regression against the production build                  |
| `pnpm e2e:update`   | Re-generates the visual baselines for the current platform                       |
| `pnpm e2e:report`   | Opens the last Playwright HTML report                                            |
| `pnpm e2e:docker`   | Runs the E2E suite in the official Playwright Linux image (Linux baselines)      |
| `pnpm perf`         | Profiling runs (3-minute match, 5-cycle memory check), see `docs/PERFORMANCE.md` |

Useful Playwright variations:

```bash
pnpm e2e tests/e2e/04-combat.spec.ts          # one spec
pnpm e2e --project=mobile-chromium            # one project
PW_WORKERS=4 pnpm e2e                         # more workers (default 2)
pnpm e2e:docker --update-snapshots            # refresh the Linux baselines
```

The E2E suite always builds and serves the current code (`vite build` + `vite preview`), the same artefact that is deployed. Visual baselines are versioned for `win32` and `linux` in `apps/web/tests/e2e/visual.spec.ts-snapshots/`. CI (GitHub Actions) runs lint, format, typecheck, unit tests and the E2E suite in the Playwright Linux image and uploads the HTML report and traces.

## Controls

The controls are also shown on the setup screen that **Play** opens, in a collapsible **How to play** panel laid out like the keyboard (Q W E over A D, Space below), each key next to the icon of its touch button. It starts open and stays closed once the player collapses it.

| Action                        | Keyboard          | Touch (landscape)          |
| ----------------------------- | ----------------- | -------------------------- |
| Sail forward                  | `W` / `↑`         | ⬆ button (left side)       |
| Turn left / right             | `A` `D` / `←` `→` | ↶ ↷ buttons (left side)    |
| Bow cannon (1 shot)           | `Space`           | centre fire button (right) |
| Port broadside (3 shots)      | `Q`               | left fire button (right)   |
| Starboard broadside (3 shots) | `E`               | right fire button (right)  |
| Pause / resume                | `Esc` / `P`       | pause button (HUD)         |

Movement and firing can be combined freely (several keys or fingers at once). Game keys are only captured while a battle is live, so menus and dialogs keep normal keyboard navigation. The battle pauses automatically when the window loses focus, the tab is hidden or a phone is turned to portrait; resuming always needs an explicit action.

On phones the battle runs in **landscape only**. The arena is letterboxed between two side gutters that hold the touch buttons, so they never cover the play area.

## Gameplay configuration

Every gameplay number lives in one typed object, `DEFAULT_GAME_CONFIG` in [`packages/game-core/src/config.ts`](packages/game-core/src/config.ts). Systems read from the match's frozen config snapshot and never hard-code balance values, so rebalancing only edits data.

| Group      | Main values (defaults)                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Match      | duration 120 s, 1 point per kill                                                                                                                 |
| Spawn      | interval 3 s, first spawn after 1.5 s, max 8 alive, opening sequence Chaser → Shooter, then 55 % Chaser / 45 % Shooter, ≥ 380 px from the player |
| Player     | 100 HP, max speed 150 px/s, turn 2.4 rad/s                                                                                                       |
| Bow cannon | 20 damage, 0.4 s cooldown, 560 px/s, 460 px range                                                                                                |
| Broadside  | 3 parallel shots × 20 damage, 1.3 s cooldown per side, 480 px/s, 320 px range                                                                    |
| Chaser     | 40 HP, 128 px/s, explodes on contact for 20 damage (no score)                                                                                    |
| Shooter    | 60 HP, 92 px/s, opens fire within 380 px, holds at 290 px; 8 damage, 1.9 s cooldown, 420 px range                                                |

The **Options** screen exposes the two player-facing settings, validated by `validateMatchOptions` and persisted in `localStorage`:

| Option            | Limits                                      | Default |
| ----------------- | ------------------------------------------- | ------- |
| Game session time | 60–180 s, whole seconds                     | 120 s   |
| Enemy spawn time  | 1–15 s, in steps of 0.5 s (always positive) | 3 s     |

Each match takes a deep-frozen snapshot of the config when it starts (`createMatchConfig`). Saving Options selects the **Custom** battle, so the next match uses exactly those values.

## Difficulties, grades and progression

**Play** opens a setup screen with four preset difficulties and a Custom battle. Presets are data in [`packages/game-core/src/difficulty.ts`](packages/game-core/src/difficulty.ts): fixed session and spawn times plus enemy multipliers applied by `applyDifficulty` (the player is never changed).

| Difficulty            | Session / spawn | Enemies                                                         |
| --------------------- | --------------- | --------------------------------------------------------------- |
| Calm Waters (Easy)    | 90 s / 4 s      | 75 % HP, 60 % damage, 85 % speed, max 5 alive                   |
| Open Sea (Normal)     | 120 s / 3 s     | Default balance                                                 |
| Storm (Challenging)   | 120 s / 2.5 s   | 120 % HP, 125 % damage, 110 % speed, faster reload, max 10      |
| Kraken’s Wrath (Hard) | 150 s / 2 s     | 140 % HP, 150 % damage, 120 % speed, much faster reload, max 12 |
| Custom                | Options values  | Default balance; always available                               |

A new player starts with Calm Waters (and Custom). **Surviving to the end with grade B or better** unlocks the next preset; progress and the best grade per difficulty are stored locally.

Every match gets a **grade** (S, A+, A, B, C, D) from a 0–100 rating (`matchRating` in [`grade.ts`](packages/game-core/src/grade.ts)):

- up to 60 points for kills, relative to the enemies the match could spawn (70 % of them earns all 60);
- up to 25 points for health left and 15 for surviving, only when the ship is still afloat (so a sunk ship tops out at B).

Thresholds: S ≥ 92, A+ ≥ 85, A ≥ 75, B ≥ 60, C ≥ 40, D below. The result screen leads with the grade, then a report card: Chasers and Shooters sunk, health left, accuracy, time, outcome and, last, the points.

In the last 10 seconds a countdown takes over: a beep every second (louder for the final three), a large pulsing number, a red vignette that tightens and a pulsing HUD timer. When the match ends, a banner and a fanfare (or a sinking sting) play while the sea keeps moving, then the battle cross-fades into the result and the report card unfolds. Resuming from the pause menu runs a short 3-2-1 get-ready countdown; **Main menu** asks for confirmation before leaving the battle. The same red pulse marks low health (30 % or less) for as long as it lasts.

On the setup screen the Custom card has a pencil button that edits its settings in place (the same form as Options); saving selects Custom and returns to the cards.

## Ranking, history and network scenarios

Ranking and match history are REST resources (`/api/ranking`, `/api/ranking/configs`, `PUT /api/matches/:matchId`, `/api/players/:playerId/matches`) mocked by MSW in the browser. Other captains come from seeded fixtures; your confirmed matches are stored in `localStorage` and survive reloads. The ranking only compares matches with the same difficulty; Custom battles are further split by session time and spawn interval. A **Waters** selector switches between leaderboards and opens on the player’s current choice.

### Selecting and resetting a scenario

- **Network panel:** open it with `?debug` in the URL (e.g. `https://…/?debug`) or **Ctrl+Shift+M** on any screen except the battle. Pick a scenario, override latency, then:
  - **Reset mock server** restores the fixtures and the `success` scenario;
  - **Reset all local data** also clears options, last result, pending and recorded matches.
- **URL parameters:** `?scenario=<id>` selects a scenario on load; `&mockLatency=<ms>` fixes every response's latency; `&mockSeed=<n>` seeds the random latency.
- The selected scenario is persisted, so it survives a reload until changed or reset.

| Scenario id                  | Behaviour                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `success`                    | Normal responses, 150–450 ms seeded latency                                         |
| `empty`                      | Ranking and history return no entries                                               |
| `manyPages`                  | Large ranking and history, for pagination                                           |
| `slow`                       | Every response takes ~2.5 s                                                         |
| `jitter`                     | Seeded random latency between 50 ms and 2 s                                         |
| `outOfOrder`                 | Alternate list requests are slow, so an older response lands after a newer one      |
| `timeout`                    | Requests never answer; the client gives up after 6 s                                |
| `offline`                    | Network error (connection failure)                                                  |
| `serverError`                | HTTP 500                                                                            |
| `clientError`                | HTTP 429                                                                            |
| `rankingDown`                | Only the ranking endpoints fail (500)                                               |
| `historyDown`                | Only the history endpoint fails (500)                                               |
| `registerTimeoutAfterCommit` | The match is stored but the first response is lost; the retry must not duplicate it |
| `registerUnavailable`        | Recording fails with 503 until another scenario is selected                         |

### Reproducing failures

1. **Loading, empty, error:** open the Captain's Log (Ranking / Match History) with `?scenario=slow`, `?scenario=empty`, `?scenario=serverError` or `?scenario=offline`. Errors offer **Try again**; transient failures retry twice automatically first.
2. **Out-of-order responses:** `?scenario=outOfOrder`, then switch ranking pages or configurations quickly. An older response never replaces newer data.
3. **Timeout after commit:** select `registerTimeoutAfterCommit` and finish a match (set a 60 s session for speed). The result screen shows the registration pending, then recorded after the automatic retry, and the match appears exactly once in both tabs.
4. **Unavailable at the end of a match:** select `registerUnavailable`, finish a match; the result screen shows the failure with **Retry now** and you can start a new match meanwhile. Reload: the record is still pending. Switch to `success` and click **Retry now** (or reload, or refocus the tab): it is recorded once.
5. **Assets failing to load:** block `/game/atlas/*` in DevTools (Network → Block request URL) and press Play. The loading panel shows an error with **Try again**; unblock and retry.

## Test instrumentation

Only active with `?test=1`; normal players never see it.

| Parameter        | Effect                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `test=1`         | Manual simulation clock; exposes `window.__pirate` (`advance(ms)`, `state()`, `config()`) and `window.__pirateData.registerMatch` |
| `clock=realtime` | With `test=1`: keeps the display-driven clock (pause/focus tests, profiling)                                                      |
| `noSpawns=1`     | With `test=1`: no enemies (isolated movement tests)                                                                               |
| `sturdy=1`       | With `test=1`: huge player HP pool, so profiling runs always reach time-up                                                        |
| `unlockAll=1`    | With `test=1`: every difficulty is unlocked                                                                                       |
| `seed=<n>`       | Match RNG seed (spawn points, enemy mix, effects)                                                                                 |

`window.__pirateMocks` (scenario selection, reset, record count) is always available. Inputs in tests still go through real keyboard and pointer events; the instrumentation only reads state and drives the clock.

## Reports

- E2E HTML reports of the delivered code (102 tests, desktop + mobile Chromium): Windows in [`docs/reports/e2e/windows/`](docs/reports/e2e/windows/index.html), Linux (Playwright Docker image, as in CI) in [`docs/reports/e2e/linux/`](docs/reports/e2e/linux/index.html). Open them with `npx playwright show-report docs/reports/e2e/windows` (or any static server). Locally, `pnpm e2e` writes `apps/web/playwright-report/` with traces of failed tests.
- Performance: [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md), raw data and the profiling HTML report in [`docs/reports/performance/`](docs/reports/performance/).

## Repository layout

```
apps/web            Vite + React + PixiJS client (deployed)
apps/server         Fastify skeleton for a future backend (GET /health)
packages/game-core  Simulation: config, world, systems, RNG, fixed-step loop (unit tested)
packages/contracts  Ranking/history DTOs, validation, ordering (shared by web, mocks, server)
assets/             Source asset pack (as provided)
docs/               Challenge brief, performance report, test and profiling reports
```

## Deployment

Vercel builds the whole workspace from the repository root using [`vercel.json`](vercel.json): `pnpm install --frozen-lockfile`, `pnpm build`, output `apps/web/dist`, with an SPA rewrite that leaves `/assets/`, `/game/` and `/mockServiceWorker.js` alone. The MSW worker ships with the build, so the published game runs the ranking and history mocks.
