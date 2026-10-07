import { expect, type Page } from '@playwright/test';

/** Mirrors `TestState` from src/game/session/testHooks.ts (kept minimal on purpose). */
export interface ShipState {
  id: number;
  kind: string;
  x: number;
  y: number;
  angle: number;
  speed: number;
  hp: number;
  maxHp: number;
}

export interface GameState {
  tick: number;
  elapsedMs: number;
  remainingMs: number;
  status: 'running' | 'ended';
  endReason: 'timeUp' | 'destroyed' | null;
  paused: boolean;
  score: number;
  arena: { width: number; height: number };
  player:
    | (ShipState & {
        cooldowns: { front: number; port: number; starboard: number };
        islandPenetration: number;
        hullBounds: { minX: number; minY: number; maxX: number; maxY: number };
      })
    | null;
  enemies: ShipState[];
  projectiles: {
    id: number;
    team: string;
    ownerShipId: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
  }[];
  stats: {
    shots: { front: number; port: number; starboard: number };
    kills: number;
    spawned: { chaser: number; shooter: number };
    playerHits: number;
  };
  renderedEntities: number;
}

interface PirateWindow {
  __pirate?: { advance(ms: number): void; state(): GameState };
  __pirateMocks?: {
    setScenario(id: string): void;
    reset(): void;
    recordCount(): number;
  };
  __pirateData?: { registerMatch(input: unknown): Promise<void> };
}

export interface OpenOptions {
  /** Hash route, e.g. '#/log/ranking'. */
  route?: string;
  /** Enables `window.__pirate` with a manual clock (default true). */
  test?: boolean;
  seed?: number;
  scenario?: string;
  /** Fixed mock latency; default 0 so tests are fast and deterministic. */
  mockLatency?: number | null;
  noSpawns?: boolean;
  /** Huge player HP pool (profiling runs always reach time-up). */
  sturdy?: boolean;
  clock?: 'manual' | 'realtime';
  /** Saved options/settings to start with. */
  settings?: {
    sessionTime?: number;
    spawnInterval?: number;
    playerName?: string;
    muted?: boolean;
  };
}

export const PLAYER_ID = 'e2e-player-0001';

export async function openApp(page: Page, options: OpenOptions = {}): Promise<void> {
  const params = new URLSearchParams();
  if (options.test ?? true) params.set('test', '1');
  params.set('seed', String(options.seed ?? 7));
  params.set('mockSeed', '1');
  if (options.scenario) params.set('scenario', options.scenario);
  const latency = options.mockLatency === undefined ? 0 : options.mockLatency;
  if (latency !== null) params.set('mockLatency', String(latency));
  if (options.noSpawns) params.set('noSpawns', '1');
  if (options.sturdy) params.set('sturdy', '1');
  if (options.clock) params.set('clock', options.clock);

  const settings = {
    playerId: PLAYER_ID,
    playerName: options.settings?.playerName ?? 'Captain Test',
    options: {
      sessionTime: options.settings?.sessionTime ?? 120,
      spawnInterval: options.settings?.spawnInterval ?? 3,
    },
    muted: options.settings?.muted ?? true,
  };
  // Only on the first load of the context, so reload tests keep their data.
  await page.addInitScript((value) => {
    if (!sessionStorage.getItem('e2e-seeded')) {
      localStorage.setItem('pirate-battle:settings:v1', JSON.stringify(value));
      sessionStorage.setItem('e2e-seeded', '1');
    }
  }, settings);

  await page.goto(`/?${params.toString()}${options.route ?? '#/'}`);
}

/** From the main menu: starts a battle and waits until it is live. */
export async function startMatch(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByTestId('hud-score')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => !!(window as PirateWindow).__pirate);
}

export function advance(page: Page, ms: number): Promise<void> {
  return page.evaluate((value) => (window as PirateWindow).__pirate!.advance(value), ms);
}

export function gameState(page: Page): Promise<GameState> {
  return page.evaluate(() => (window as PirateWindow).__pirate!.state());
}

/** Holds keys while advancing the manual clock, then releases them. */
export async function holdKeys(page: Page, keys: string[], ms: number): Promise<void> {
  for (const key of keys) await page.keyboard.down(key);
  await advance(page, ms);
  for (const key of keys) await page.keyboard.up(key);
}

/** Advances in chunks until `predicate(state)` holds (or fails after `maxMs`). */
export async function advanceUntil(
  page: Page,
  predicate: (state: GameState) => boolean,
  { stepMs = 100, maxMs = 60_000 } = {},
): Promise<GameState> {
  for (let elapsed = 0; elapsed <= maxMs; elapsed += stepMs) {
    const state = await gameState(page);
    if (predicate(state)) return state;
    await advance(page, stepMs);
  }
  throw new Error(`Condition not met within ${maxMs} ms of game time`);
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Turns the player's bow towards an enemy using the real A/D controls. */
export async function aimAt(page: Page, enemyId: number, tolerance = 0.05): Promise<GameState> {
  for (let i = 0; i < 80; i++) {
    const state = await gameState(page);
    const enemy = state.enemies.find((e) => e.id === enemyId);
    const player = state.player;
    if (!enemy || !player) return state;
    const delta = wrap(Math.atan2(enemy.y - player.y, enemy.x - player.x) - player.angle);
    if (Math.abs(delta) < tolerance) return state;
    const ms = Math.max(17, Math.min(100, (Math.abs(delta) / 2.4) * 1000));
    await holdKeys(page, [delta > 0 ? 'KeyD' : 'KeyA'], ms);
  }
  return gameState(page);
}

const mocksReady = (page: Page) =>
  page.waitForFunction(() => !!(window as PirateWindow).__pirateMocks);

export const mocks = {
  setScenario: async (page: Page, id: string) => {
    await mocksReady(page);
    await page.evaluate((s) => (window as PirateWindow).__pirateMocks!.setScenario(s), id);
  },
  recordCount: async (page: Page) => {
    await mocksReady(page);
    return page.evaluate(() => (window as PirateWindow).__pirateMocks!.recordCount());
  },
  registerMatch: async (page: Page, input: unknown) => {
    await page.waitForFunction(() => !!(window as PirateWindow).__pirateData);
    await page.evaluate((i) => (window as PirateWindow).__pirateData!.registerMatch(i), input);
  },
};

/** A completed match payload owned by the E2E player. */
export function matchInput(matchId: string, overrides: Record<string, unknown> = {}) {
  return {
    matchId,
    playerId: PLAYER_ID,
    playerName: 'Captain Test',
    score: 9,
    durationMs: 60_000,
    endReason: 'timeUp',
    endedAt: '2026-10-07T12:00:00.000Z',
    config: { sessionTime: 120, spawnInterval: 3 },
    ...overrides,
  };
}

/** Plays a 60 s, spawn-free match to its time-up end (manual clock). */
export async function finishQuickMatch(page: Page): Promise<void> {
  await startMatch(page);
  await advance(page, 60_000);
  await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible();
}

/** Reloads without the `scenario` URL override, so the persisted scenario applies. */
export async function reloadWithoutScenario(page: Page): Promise<void> {
  const url = new URL(page.url());
  url.searchParams.delete('scenario');
  await page.goto(url.toString());
}
