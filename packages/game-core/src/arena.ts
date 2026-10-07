import { clamp } from './math';

/**
 * Static collision shape. Islands are rounded rectangles (which also cover
 * circles: w = h = 2r) in world pixels, with x/y at the top-left corner.
 */
export interface RoundedRect {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}

export type IslandKind = 'sand' | 'grass' | 'rock' | 'mossyRock';

export interface Island {
  id: string;
  kind: IslandKind;
  /** Visual footprint in tiles (top-left corner + size); the renderer draws from it. */
  tile: { col: number; row: number; cols: number; rows: number };
  /** Collision shape, slightly inset from the art's transparent margins. */
  collider: RoundedRect;
}

export interface ArenaMap {
  id: string;
  width: number;
  height: number;
  tileSize: number;
  playerStart: { x: number; y: number; angle: number };
  islands: readonly Island[];
}

const TILE = 64;

function island(
  id: string,
  kind: IslandKind,
  col: number,
  row: number,
  cols: number,
  rows: number,
  inset: number,
  radius: number,
): Island {
  return {
    id,
    kind,
    tile: { col, row, cols, rows },
    collider: {
      x: col * TILE + inset,
      y: row * TILE + inset,
      w: cols * TILE - inset * 2,
      h: rows * TILE - inset * 2,
      r: radius,
    },
  };
}

/** 1280x720 (16:9) arena: two large islands and a few rocks, centre left open. */
export const DEFAULT_ARENA: ArenaMap = {
  id: 'default',
  width: 1280,
  height: 720,
  tileSize: TILE,
  playerStart: { x: 640, y: 360, angle: -Math.PI / 2 },
  islands: [
    island('sand-nw', 'sand', 2, 1, 3, 3, 8, 56),
    island('grass-se', 'grass', 13, 6, 4, 4, 10, 64),
    island('rock-sw', 'rock', 6, 8, 1, 1, 12, 20),
    island('rock-ne', 'mossyRock', 16, 2, 1, 1, 12, 20),
    island('rock-n', 'rock', 9, 1, 1, 1, 12, 20),
  ],
};

export interface Penetration {
  /** Unit normal pointing out of the shape. */
  nx: number;
  ny: number;
  /** How deep the circle overlaps the shape (> 0 when colliding). */
  depth: number;
}

/**
 * Circle vs rounded rectangle. Returns the push-out vector or null when the
 * shapes do not overlap.
 */
export function circleVsRoundedRect(
  cx: number,
  cy: number,
  radius: number,
  rect: RoundedRect,
): Penetration | null {
  // Shrink the rect by its corner radius: the rounded rect is that inner rect
  // inflated by r, so the test becomes circle(radius + r) vs inner rect.
  const left = rect.x + rect.r;
  const top = rect.y + rect.r;
  const right = rect.x + rect.w - rect.r;
  const bottom = rect.y + rect.h - rect.r;
  const reach = radius + rect.r;

  const px = clamp(cx, left, right);
  const py = clamp(cy, top, bottom);
  const dx = cx - px;
  const dy = cy - py;
  const distSq = dx * dx + dy * dy;

  if (distSq > 0) {
    if (distSq >= reach * reach) return null;
    const dist = Math.sqrt(distSq);
    return { nx: dx / dist, ny: dy / dist, depth: reach - dist };
  }

  // Centre inside the inner rect: push out through the nearest side.
  const toLeft = cx - left;
  const toRight = right - cx;
  const toTop = cy - top;
  const toBottom = bottom - cy;
  const min = Math.min(toLeft, toRight, toTop, toBottom);
  if (min === toLeft) return { nx: -1, ny: 0, depth: toLeft + reach };
  if (min === toRight) return { nx: 1, ny: 0, depth: toRight + reach };
  if (min === toTop) return { nx: 0, ny: -1, depth: toTop + reach };
  return { nx: 0, ny: 1, depth: toBottom + reach };
}

export function pointInRoundedRect(x: number, y: number, rect: RoundedRect): boolean {
  return circleVsRoundedRect(x, y, 0, rect) !== null;
}

/** True when a circle overlaps any island (optionally inflated by `margin`). */
export function circleHitsIsland(
  arena: ArenaMap,
  x: number,
  y: number,
  radius: number,
): Island | null {
  for (const isl of arena.islands) {
    if (circleVsRoundedRect(x, y, radius, isl.collider)) return isl;
  }
  return null;
}

/**
 * True when the segment between two points crosses an island. Sampled at a
 * fixed step, which is plenty for line-of-sight checks against large shapes.
 */
export function segmentHitsIsland(
  arena: ArenaMap,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  step = 12,
): boolean {
  const length = Math.hypot(bx - ax, by - ay);
  const samples = Math.max(1, Math.ceil(length / step));
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    if (circleHitsIsland(arena, ax + (bx - ax) * t, ay + (by - ay) * t, 0)) return true;
  }
  return false;
}
