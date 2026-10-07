import type { ShipKind } from '@pirate/game-core';

/**
 * Visual mapping onto the asset pack. Ship sprites come in 6 colours x 4 damage
 * states: `ship_{c}` intact, `ship_{c+6}` damaged, `ship_{c+12}` badly damaged,
 * `ship_{c+18}` wreck. Colours: 1 white, 2 black, 3 red, 4 green, 5 blue, 6 yellow.
 */
export const SHIP_COLOR: Record<ShipKind, number> = {
  player: 5,
  chaser: 3,
  shooter: 2,
};

export type DamageState = 0 | 1 | 2 | 3;

export function damageState(hp: number, maxHp: number): DamageState {
  if (hp <= 0) return 3;
  const ratio = hp / maxHp;
  if (ratio > 2 / 3) return 0;
  if (ratio > 1 / 3) return 1;
  return 2;
}

export function shipFrame(kind: ShipKind, state: DamageState): string {
  return `ship_${SHIP_COLOR[kind] + state * 6}`;
}

/** Ship sprites point their bow down (+y); world heading 0 points along +x. */
export const SHIP_ROTATION_OFFSET = -Math.PI / 2;
/** Source ship sprite length in pixels, used to scale art to the hull size. */
export const SHIP_SPRITE_LENGTH = 113;

export const TILES = {
  water: 'tile_73',
  /** Island art as tile-frame grids (row-major), keyed by island kind. */
  sand: [
    ['tile_1', 'tile_2', 'tile_3'],
    ['tile_17', 'tile_18', 'tile_19'],
    ['tile_33', 'tile_34', 'tile_35'],
  ],
  grass: [
    ['tile_6', 'tile_7', 'tile_8', 'tile_9'],
    ['tile_22', 'tile_23', 'tile_24', 'tile_25'],
    ['tile_38', 'tile_39', 'tile_40', 'tile_41'],
    ['tile_54', 'tile_55', 'tile_56', 'tile_57'],
  ],
  rock: [['tile_50']],
  mossyRock: [['tile_66']],
} as const;

export const HEALTH_BAR = {
  frame: 'enemy_health_frame',
  playerFill: 'enemy_health_fill_green',
  enemyFill: 'enemy_health_fill_red',
  /** Fill area inside the 160x40 frame (from the atlas `ui.layout.fill_rect`). */
  fillRect: { x: 24, y: 12, w: 112, h: 15 },
  scale: 0.42,
  /** Distance above the ship centre, in world pixels. */
  offsetY: 62,
} as const;
