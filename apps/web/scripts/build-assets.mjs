/**
 * Builds runtime assets from the source pack in /assets into public/game.
 *
 * - Copies atlas images, the tilesheet, sounds and the menu background.
 * - Converts the Starling/Sparrow XML ship atlas into a PixiJS JSON atlas.
 * - Generates a JSON atlas for the 64x64 tilesheet grid.
 * - Re-points the UI atlas JSON (already PixiJS/TexturePacker format) at the copied image.
 *
 * Note: the source "retina" ship sheet has the same size and coordinates as the
 * default one, so only the default ship atlas is emitted.
 */
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../../assets');
const out = resolve(here, '../public/game');

const TILE_SIZE = 64;
const TILE_COLUMNS = 16;
const TILE_ROWS = 6;

async function copy(from, to) {
  await mkdir(dirname(join(out, to)), { recursive: true });
  await copyFile(join(src, from), join(out, to));
}

async function writeJson(to, data) {
  await mkdir(dirname(join(out, to)), { recursive: true });
  await writeFile(join(out, to), `${JSON.stringify(data, null, 2)}\n`);
}

function frame(x, y, w, h) {
  const size = { w, h };
  return {
    frame: { x, y, ...size },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, ...size },
    sourceSize: size,
  };
}

function xmlAtlasToJson(xml, image) {
  const frames = {};
  const re =
    /<SubTexture\s+name="([^"]+)"\s+x="(\d+)"\s+y="(\d+)"\s+width="(\d+)"\s+height="(\d+)"/g;
  for (const [, name, x, y, w, h] of xml.matchAll(re)) {
    frames[name.replace(/\.png$/, '')] = frame(Number(x), Number(y), Number(w), Number(h));
  }
  return { frames, meta: { image, format: 'RGBA8888', scale: '1' } };
}

function tileAtlas(image, scale) {
  const frames = {};
  const px = TILE_SIZE * scale;
  for (let row = 0; row < TILE_ROWS; row++) {
    for (let col = 0; col < TILE_COLUMNS; col++) {
      frames[`tile_${row * TILE_COLUMNS + col + 1}`] = frame(col * px, row * px, px, px);
    }
  }
  return { frames, meta: { image, format: 'RGBA8888', scale: String(scale) } };
}

async function uiAtlas(from, image) {
  const json = JSON.parse(await readFile(join(src, from), 'utf8'));
  return { ...json, meta: { ...json.meta, image } };
}

async function main() {
  await rm(out, { recursive: true, force: true });

  // Ships, effects and projectiles (XML -> JSON).
  await copy('spritesheet/ships_miscellaneous_sheet.png', 'atlas/ships.png');
  const shipsXml = await readFile(join(src, 'spritesheet/ships_miscellaneous_sheet.xml'), 'utf8');
  await writeJson('atlas/ships.json', xmlAtlasToJson(shipsXml, 'ships.png'));

  // UI atlas; the @2x suffix lets PixiJS pick the resolution.
  await copy('spritesheet/ui_sheet.png', 'atlas/ui.png');
  await copy('spritesheet/ui_sheet_retina.png', 'atlas/ui@2x.png');
  await writeJson('atlas/ui.json', await uiAtlas('spritesheet/ui_sheet.json', 'ui.png'));
  await writeJson(
    'atlas/ui@2x.json',
    await uiAtlas('spritesheet/ui_sheet_retina.json', 'ui@2x.png'),
  );

  // Tiles.
  await copy('tilesheet/tiles_sheet.png', 'atlas/tiles.png');
  await copy('tilesheet/tiles_sheet_retina.png', 'atlas/tiles@2x.png');
  await writeJson('atlas/tiles.json', tileAtlas('tiles.png', 1));
  await writeJson('atlas/tiles@2x.json', tileAtlas('tiles@2x.png', 2));

  // Menu background and sounds.
  await copy('ui_scene_background.png', 'ui_scene_background.png');
  const sounds = await readdir(join(src, 'sounds'));
  await Promise.all(sounds.map((file) => copy(join('sounds', file), join('sounds', file))));

  console.log(`assets built -> ${out}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
