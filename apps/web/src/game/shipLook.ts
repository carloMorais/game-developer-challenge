import type { ShipKind } from '@pirate/game-core';

/**
 * Pack colours, shared by sails, pennants and the prebuilt ship sprites:
 * 1 white, 2 black, 3 red, 4 green, 5 blue, 6 yellow.
 */
export const SHIP_COLORS = [1, 2, 3, 4, 5, 6] as const;
export type ShipColor = (typeof SHIP_COLORS)[number];

export const SHIP_COLOR_NAMES: Record<ShipColor, string> = {
  1: 'White',
  2: 'Black',
  3: 'Red',
  4: 'Green',
  5: 'Blue',
  6: 'Yellow',
};

export const HULL_TYPES = ['large', 'small'] as const;
export type HullType = (typeof HULL_TYPES)[number];

export const HULL_NAMES: Record<HullType, string> = {
  large: 'Galleon',
  small: 'Sloop',
};

/** How a ship is assembled from the pack's parts. */
export interface ShipLook {
  /** Main sail (and the small bow sail, which comes in the same colour). */
  sail: ShipColor;
  /** Pennant on the mast. */
  flag: ShipColor;
  hull: HullType;
}

export const DEFAULT_PLAYER_LOOK: ShipLook = { sail: 5, flag: 5, hull: 'large' };

/** Enemies keep fixed colours so they always read as enemies. */
export const ENEMY_LOOKS: Record<Exclude<ShipKind, 'player'>, ShipLook> = {
  chaser: { sail: 3, flag: 3, hull: 'large' },
  shooter: { sail: 2, flag: 2, hull: 'large' },
};

export function isShipColor(value: unknown): value is ShipColor {
  return SHIP_COLORS.includes(value as ShipColor);
}

export function isHullType(value: unknown): value is HullType {
  return HULL_TYPES.includes(value as HullType);
}

/** Reads a stored look, or null if any part is invalid. */
export function parseShipLook(raw: unknown): ShipLook | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { sail, flag, hull } = raw as Record<string, unknown>;
  if (!isShipColor(sail) || !isShipColor(flag) || !isHullType(hull)) return null;
  return { sail, flag, hull };
}
