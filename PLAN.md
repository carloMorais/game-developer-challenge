# Pirate Battle — Implementation Plan

Working plan agreed before implementation. The challenge brief is in [`docs/CHALLENGE.md`](docs/CHALLENGE.md) (it was the original `README.md`, replaced by the solution README at delivery).

## Constraints & priorities

- **Deadline:** 2 days. Delivered in two working days (Oct 7, ~08:00–21:40, and Oct 8, ~08:00–14:40). The times below are the actual ones, taken from the git history.
- **Priority:** polished gameplay (35 pts), without leaving any README requirement uncovered.
- **Workflow:** Claude implements, the owner directs and reviews. One branch + PR per phase.
- **Language:** UI, code identifiers and docs in English.

## Key decisions

| Topic                | Decision                                                                                                                                                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository           | Single repository holding frontend **and** backend, using pnpm workspaces: `apps/web`, `apps/server`, `packages/contracts`, `packages/game-core` (see structure below)                                                                                                  |
| Build                | Vite + React + TypeScript (`strict`, shared `tsconfig.base.json`) + ESLint/Prettier at the root                                                                                                                                                                         |
| Backend              | `apps/server`: Node + Fastify. **Structure only for this challenge** (package, tsconfig, entry point, scripts, no routes). The game ships with MSW mocks as required. Fastify was chosen for typed schemas and `@fastify/websocket` later                               |
| Rendering            | PixiJS v8 for arena, ships, projectiles, effects, health bars                                                                                                                                                                                                           |
| UI state             | Zustand; the simulation publishes throttled snapshots (~10 Hz plus discrete events) — no React render per frame                                                                                                                                                         |
| Simulation           | ECS-lite: entities are plain data, systems are pure-ish functions (input → AI → movement → weapons → projectiles → collisions → damage → spawn → match rules). Fixed timestep 60 Hz with an accumulator and a max-frame clamp. Pixi-agnostic and unit-testable          |
| Arena                | Fixed logical world (≈1280×720) built from the tilesheet; islands use circle/rect colliders; ships use circles (OBB if needed); letterboxed scaling with DPR-aware resolution                                                                                           |
| Config               | A single typed `GameConfig` (durations, spawn interval & distribution, HP, speeds, damage, range, projectile speed/TTL, cooldowns, Shooter range). Each match takes a frozen snapshot at start                                                                          |
| Input                | Keyboard: W/↑ forward, A/D/←/→ rotate, Space front shot, Q/E port/starboard broadside, Esc/P pause. Touch: virtual joystick (left) and fire buttons (right). Keys are only captured while gameplay is active                                                            |
| Mobile               | Landscape only; "rotate your device" overlay in portrait                                                                                                                                                                                                                |
| Player identity      | UUID `playerId` persisted locally; editable name in Options (default "Captain")                                                                                                                                                                                         |
| Ranking              | Filtered by match config (session time + spawn interval), with a selector to switch. Tie-break: score desc → duration asc → date asc → matchId                                                                                                                          |
| Data layer           | Axios client + TanStack Query. Idempotent `POST /matches` keyed by a client-generated `matchId`; local pending queue persisted in localStorage, retried with backoff and on reconnect; invalidate ranking + history on success and on tab focus                         |
| Mocks                | MSW in dev, tests **and** the production build. Shared contracts/fixtures/handlers. Seeded scenarios (success, empty, many pages, slow, jitter, out-of-order, timeout, offline, 4xx/5xx, timeout-after-commit, unavailable-at-end). Confirmed records persisted locally |
| Scenario selection   | In-app dev panel (`?debug=1` or a shortcut), also on the deployed build, plus `?scenario=` query param; "Reset" restores initial state                                                                                                                                  |
| Test instrumentation | `?test=1&seed=N` exposes `window.__pirate`: manual clock (`step(ms)`), state reads, deterministic RNG. Inputs still go through real keyboard/touch events                                                                                                               |
| Extras               | Sound (provided WAVs) with mute toggle; screen shake and particles; GitHub Actions CI (lint, typecheck, unit, Playwright)                                                                                                                                               |
| Deploy               | Vercel builds only `apps/web` (root directory `apps/web`, pnpm workspace install), with SPA fallback and the MSW worker served from `/public`. The server is not deployed                                                                                               |

## Future-proofing: WebSockets

> **Note:** the project is expected to grow to use WebSockets later (e.g. live ranking updates and, possibly, online/multiplayer sessions). WebSockets are **out of scope for this challenge**, since it requires single-player play and REST mocked with MSW. Development should still leave seams so that adding them later does not require rewrites:

- **Data layer behind interfaces:** components and query hooks depend on a `RankingRepository` / `MatchRepository` interface, not on Axios directly. Today it is a REST (Axios) implementation; later a WebSocket-backed one can push updates into the TanStack Query cache (`setQueryData` / `invalidateQueries`) instead of relying only on refetch-on-focus.
- **Transport-agnostic contracts:** the request/response and event types live in `packages/contracts`, shared by web, mocks and (later) the server. They are plain serializable DTOs with a version field, so they can be reused as WS message payloads.
- **Idempotency by `matchId`:** already planned. It makes delivery over any transport safe to retry.
- **Input as commands:** input produces serializable, tick-stamped intent commands (`{ tick, playerId, intents }`) that the sim consumes. They are never read straight from the DOM inside systems, so they can later be sent over the network.
- **Deterministic, serializable simulation:** seeded RNG, fixed timestep, stable entity IDs, and a world state that can be snapshotted and serialized. The sim lives in `packages/game-core` with no DOM or Pixi imports, so `apps/server` can run the same code for server-authoritative or rollback approaches later.
- **Server already in place:** `apps/server` exists from day one, so adding REST routes and a WS gateway is additive and does not restructure the repo.
- **Entities owned by an id, not "the player":** systems iterate over ships with an `ownerId`/`team` instead of special-casing a single global player where avoidable.
- **Event bus for sim → UI:** discrete game events (hit, kill, match end) go through a typed emitter that a network layer could also subscribe to.
- **MSW is compatible:** MSW supports mocking WebSocket connections (`ws` API), so the same mock/scenario approach can extend to it.

These seams should stay lightweight. No speculative WS code goes in now.

## Proposed structure

```
pnpm-workspace.yaml
package.json            root scripts (dev, build, lint, typecheck, test, e2e) via pnpm -r / --filter
tsconfig.base.json
apps/
  web/                  Vite + React + Pixi client (deployed)
    src/
      app/              React shell, screen routing, providers
      ui/               screens (Menu, Options, Game, Result, Ranking, History), components, a11y
      game/
        render/         Pixi app, asset loader, sprite pools, effects, health bars
        input/          keyboard + touch → tick-stamped intent commands
        session/        GameSession: wires game-core + render + input, lifecycle, snapshot bridge
        audio/
      data/             repository interfaces, axios REST impl, query hooks, pending queue
      mocks/            MSW handlers, fixtures, scenarios, persistence, browser/node setup
      store/            zustand stores (options, last result, hud snapshot)
    public/             assets, mockServiceWorker.js
    tests/e2e/          Playwright specs + fixtures
  server/               Node + Fastify. Structure only (entry point, config, scripts). No routes yet
packages/
  contracts/            DTOs for ranking/history (+ future WS messages), versioned, shared by web/mocks/server
  game-core/            GameConfig + validation, world, entities, systems, rng, clock. No DOM or Pixi imports. Vitest unit tests
```

## Phases

| #   | Phase              | Time            | Deliverable                                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Scaffold           | ~1 h (day 1)    | pnpm workspaces (web, server skeleton, contracts, game-core), Vite/TS/lint, Pixi, Query, Axios, MSW, Playwright, Vitest, CI, Vercel config; asset pipeline (ships XML atlas → Pixi JSON)                                                                                                                                                                            |
| 1   | Simulation core    | ~20 min (day 1) | Config, loop, player movement/rotation, arena bounds, islands, weapons & cooldowns, projectiles, Chaser/Shooter AI, safe spawns, match rules, pause/resume, restart. Unit tests                                                                                                                                                                                     |
| 2   | Rendering & input  | ~1 h (day 1)    | Pixi renderer, texture loading with progress/failure/retry, damage states, explosions, muzzle flash, shake, health bars, resize/DPR, Strict Mode-safe lifecycle, keyboard + touch                                                                                                                                                                                   |
| 3   | Screens & UX       | ~25 min (day 1) | Menu, Options (validation + persistence), HUD, pause dialog, Result, a11y (focus, live region, labels, contrast), sound                                                                                                                                                                                                                                             |
| 4   | Ranking & history  | ~35 min (day 1) | Contracts, MSW handlers + scenarios + dev panel, query hooks, idempotent registration, pending recovery, out-of-order protection                                                                                                                                                                                                                                    |
| 5   | E2E tests          | ~2 h (day 1)    | The 12 required areas, desktop + mobile Chromium, visual baselines (menu, arena, result), HTML report + traces                                                                                                                                                                                                                                                      |
| 6   | Perf, docs, deploy | ~2.5 h (day 1)  | 3-min profiling (FPS, p95 frame time, entity count), 5-cycle memory check, README, ARCHITECTURE.md, licenses, Vercel deploy                                                                                                                                                                                                                                         |
| 7   | Gameplay polish    | ~6 h (day 1)    | Difficulty presets + unlocks, final countdown, end-of-match transition, result summary with grades, collapsible How to play, ships assembled from parts with customisation, cannon reload feedback with per-side sounds, castaways, hit rocking, pause get-ready countdown, result cross-fade, reactive ship wakes                                                  |
| 8   | Mobile & release   | ~6.5 h (day 2)  | Fullscreen + landscape lock on Set sail / Play again (autoFullscreen setting, toggle), installable PWA (manifest + icons, no extra service worker), larger translucent touch buttons over a full-screen arena, compact HUD that fades under ships, short-screen dialogs without scroll, difficulty carousel, re-profiling, visual tolerance 0.002, Lighthouse fixes |

Phase 1 and 2 may be interleaved so gameplay is visible early for feel tuning.

## Risks

- **Scope vs. 2 days:** tests and the network-failure matrix are the biggest time sinks; keep the sim deterministic from day one so tests are cheap.
- **PixiJS lifecycle under Strict Mode:** async `app.init()` + double mount — guard with an abort token and destroy in cleanup.
- **Visual regression flakiness:** freeze clock, seed RNG, disable animations/particles in snapshot states, pin viewport and DPR.
- **MSW in production:** make sure `mockServiceWorker.js` is deployed and the app awaits `worker.start()` before the first query.
