import { Container, Graphics, Sprite, TilingSprite, type Spritesheet } from 'pixi.js';
import type { ArenaMap } from '@pirate/game-core';
import { TILES } from './theme';

/**
 * Static arena: tiling water (extended past the arena so letterbox bars stay
 * themed), island tiles and a subtle frame marking the playable area.
 */
export class ArenaView {
  readonly water: TilingSprite;
  readonly islands = new Container();
  readonly frame = new Graphics();

  constructor(
    private readonly arena: ArenaMap,
    tiles: Spritesheet,
  ) {
    this.water = new TilingSprite({ texture: tiles.textures[TILES.water]! });

    for (const island of arena.islands) {
      const grid = TILES[island.kind];
      grid.forEach((row, r) =>
        row.forEach((frame, c) => {
          const sprite = new Sprite(tiles.textures[frame]!);
          sprite.position.set(
            (island.tile.col + c) * arena.tileSize,
            (island.tile.row + r) * arena.tileSize,
          );
          this.islands.addChild(sprite);
        }),
      );
    }

    this.frame
      .rect(0, 0, arena.width, arena.height)
      .stroke({ width: 4, color: 0x0b2236, alpha: 0.35 });
  }

  /** Covers the whole screen with water; `left/top/width/height` are in world units. */
  layoutWater(left: number, top: number, width: number, height: number): void {
    this.water.position.set(left, top);
    this.water.width = width;
    this.water.height = height;
    // Keep the tiles aligned with the arena grid regardless of the letterbox.
    this.water.tilePosition.set(-left, -top);
  }

  /** Slow drift so the sea feels alive; driven by render time. */
  animate(timeMs: number): void {
    const drift = (timeMs / 1000) * 6;
    this.water.tilePosition.x = -this.water.x + drift;
    this.water.tilePosition.y = -this.water.y + drift * 0.5;
  }

  get arenaSize(): { width: number; height: number } {
    return { width: this.arena.width, height: this.arena.height };
  }
}
