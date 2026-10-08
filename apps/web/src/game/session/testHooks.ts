import {
  circleVsRoundedRect,
  forEachHullCircle,
  getPlayer,
  type EndReason,
  type MatchStatus,
} from '@pirate/game-core';
import type { GameSession } from './GameSession';

export interface TestShip {
  id: number;
  kind: string;
  x: number;
  y: number;
  angle: number;
  speed: number;
  hp: number;
  maxHp: number;
}

export interface TestState {
  tick: number;
  elapsedMs: number;
  remainingMs: number;
  status: MatchStatus;
  endReason: EndReason | null;
  paused: boolean;
  score: number;
  arena: { width: number; height: number };
  player:
    | (TestShip & {
        cooldowns: { front: number; port: number; starboard: number };
        /** Deepest overlap of any hull circle with an island (0 = clear). */
        islandPenetration: number;
        /** Hull circles' extremes, to check arena limits. */
        hullBounds: { minX: number; minY: number; maxX: number; maxY: number };
      })
    | null;
  enemies: TestShip[];
  projectiles: {
    id: number;
    team: string;
    ownerShipId: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
  }[];
  stats: GameSession['stats'];
  renderedEntities: number;
}

export interface PirateTestApi {
  /** Advances the simulation by `ms` (fixed 60 Hz steps) and renders a frame. */
  advance(ms: number): void;
  state(): TestState;
  config(): unknown;
  /** Moves the player ship under a screen point (CSS pixels) and renders a frame. */
  placePlayerAt(screenX: number, screenY: number): void;
}

declare global {
  interface Window {
    __pirate?: PirateTestApi;
  }
}

/** Installs `window.__pirate` for the given session; returns the uninstaller. */
export function installTestHooks(session: GameSession): () => void {
  const api: PirateTestApi = {
    advance: (ms) => session.advance(ms),
    config: () => session.world.config,
    placePlayerAt: (screenX, screenY) => {
      const player = getPlayer(session.world);
      if (!player) return;
      const { x, y } = session.screenToWorld(screenX, screenY);
      player.x = x;
      player.y = y;
      player.prevX = x;
      player.prevY = y;
      session.advance(0);
    },
    state: () => {
      const world = session.world;
      const player = getPlayer(world);
      let islandPenetration = 0;
      const hullBounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      if (player) {
        forEachHullCircle(world, player, (x, y, r) => {
          hullBounds.minX = Math.min(hullBounds.minX, x - r);
          hullBounds.minY = Math.min(hullBounds.minY, y - r);
          hullBounds.maxX = Math.max(hullBounds.maxX, x + r);
          hullBounds.maxY = Math.max(hullBounds.maxY, y + r);
          for (const island of world.arena.islands) {
            const hit = circleVsRoundedRect(x, y, r, island.collider);
            if (hit) islandPenetration = Math.max(islandPenetration, hit.depth);
          }
        });
      }
      const ship = (s: NonNullable<typeof player>): TestShip => ({
        id: s.id,
        kind: s.kind,
        x: s.x,
        y: s.y,
        angle: s.angle,
        speed: s.speed,
        hp: s.hp,
        maxHp: s.maxHp,
      });
      return {
        tick: world.tick,
        elapsedMs: world.elapsedMs,
        remainingMs: world.config.match.duration * 1000 - world.elapsedMs,
        status: world.status,
        endReason: world.endReason,
        paused: session.isPaused,
        score: world.score,
        arena: { width: world.arena.width, height: world.arena.height },
        player: player
          ? { ...ship(player), cooldowns: { ...player.cooldowns }, islandPenetration, hullBounds }
          : null,
        enemies: world.ships.filter((s) => s.team === 'enemy').map(ship),
        projectiles: world.projectiles.map((p) => ({
          id: p.id,
          team: p.team,
          ownerShipId: p.ownerShipId,
          x: p.x,
          y: p.y,
          vx: p.vx,
          vy: p.vy,
        })),
        stats: structuredClone(session.stats),
        renderedEntities: session.renderedEntities,
      };
    },
  };
  window.__pirate = api;
  return () => {
    if (window.__pirate === api) delete window.__pirate;
  };
}
