import { Assets, type Spritesheet } from 'pixi.js';

/** Atlases used by the combat scene. Built from /assets by scripts/build-assets.mjs. */
const ATLASES = {
  ships: 'game/atlas/ships.json',
  tiles: 'game/atlas/tiles.json',
  ui: 'game/atlas/ui.json',
} as const;

export type AtlasName = keyof typeof ATLASES;
export type GameAssets = Record<AtlasName, Spritesheet>;

export class AssetLoadError extends Error {
  constructor(
    readonly atlas: AtlasName,
    cause: unknown,
  ) {
    super(`Failed to load "${atlas}" assets`, { cause });
    this.name = 'AssetLoadError';
  }
}

let cached: GameAssets | null = null;

/**
 * Loads (once) and returns the combat textures. PixiJS caches loaded assets, so
 * every match after the first reuses the same textures. A failed atlas is
 * unloaded so a retry fetches it again instead of reusing the failed promise.
 */
export async function loadGameAssets(onProgress?: (progress: number) => void): Promise<GameAssets> {
  if (cached) {
    onProgress?.(1);
    return cached;
  }

  const names = Object.keys(ATLASES) as AtlasName[];
  const loaded: Partial<GameAssets> = {};
  let done = 0;
  // Promise.all rejects on the first failure while the other atlases keep
  // loading; their progress must not be reported after the failure.
  let failed = false;
  onProgress?.(0);

  await Promise.all(
    names.map(async (name) => {
      const url = `${import.meta.env.BASE_URL}${ATLASES[name]}`;
      try {
        loaded[name] = await Assets.load<Spritesheet>(url);
      } catch (error) {
        failed = true;
        await Assets.unload(url).catch(() => undefined);
        throw new AssetLoadError(name, error);
      }
      done++;
      if (!failed) onProgress?.(done / names.length);
    }),
  );

  cached = loaded as GameAssets;
  return cached;
}
