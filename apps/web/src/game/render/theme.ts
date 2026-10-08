import type { ShipLook } from '../shipLook';

/**
 * Visual mapping onto the asset pack. Ships are assembled from parts (hull,
 * sails, pennant, cannons); each part comes in 4 damage states.
 */
export type DamageState = 0 | 1 | 2 | 3;

export function damageState(hp: number, maxHp: number): DamageState {
  if (hp <= 0) return 3;
  const ratio = hp / maxHp;
  if (ratio > 2 / 3) return 0;
  if (ratio > 1 / 3) return 1;
  return 2;
}

/** Prebuilt sprite (`ship_{c}` intact .. `ship_{c+18}` wreck), used for the sinking wreck. */
export function shipFrame(look: ShipLook, state: DamageState): string {
  return `ship_${look.sail + state * 6}`;
}

export function hullFrame(look: ShipLook, state: DamageState): string {
  return `hull_${look.hull}_${state + 1}`;
}

/** Sail rows in the pack: intact, damaged, wreck (grey), torn. */
const SAIL_ROW: Record<DamageState, number> = { 0: 0, 1: 1, 2: 3, 3: 2 };

export function sailFrame(look: ShipLook, state: DamageState): string {
  return `sail_large_${look.sail + SAIL_ROW[state] * 6}`;
}

/** The small bow sail; there is no white one, and wrecks lose it. */
export function smallSailFrame(look: ShipLook, state: DamageState): string | null {
  return look.sail === 1 || state === 3 ? null : `sail_small_${look.sail}`;
}

export function flagFrame(look: ShipLook, state: DamageState): string {
  return `flag_${state === 3 ? 2 : look.flag}`;
}

/**
 * Part centres in the source sprite's pixels, relative to the 66x113 ship
 * sprite's centre (measured against the prebuilt `ship_*` art). Bow is +y and
 * port is +x (see SHIP_ROTATION_OFFSET).
 */
export const SHIP_LAYOUT = {
  hull: { x: 0, y: 2.5 },
  sail: { x: 0, y: -9 },
  smallSail: { x: 0, y: 29.5 },
  flag: { x: 0, y: -45.5 },
  /**
   * `cannon_loose` muzzles point +x in the art. The bow gun sits on the
   * foredeck just ahead of the small sail, facing forward; the broadside guns
   * sit amidships over each rail, facing outboard.
   */
  cannons: {
    front: { x: 0, y: 44, rotation: Math.PI / 2 },
    port: { x: 16, y: 14, rotation: 0 },
    starboard: { x: -16, y: 14, rotation: Math.PI },
  },
} as const;

/** The sloop's bow is drawn 2px off the art's centre line; its bow gun follows it. */
const BOW_GUN_SHIFT: Record<ShipLook['hull'], number> = { large: 0, small: 2 };

export function cannonPlacement(look: ShipLook, slot: keyof typeof SHIP_LAYOUT.cannons) {
  const at = SHIP_LAYOUT.cannons[slot];
  return slot === 'front' ? { ...at, x: at.x + BOW_GUN_SHIFT[look.hull] } : at;
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
