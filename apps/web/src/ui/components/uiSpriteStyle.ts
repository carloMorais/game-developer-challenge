import type { CSSProperties } from 'react';
import uiAtlas from '../../../../../assets/spritesheet/ui_sheet.json';
import uiAtlasRetina from '../../../../../assets/spritesheet/ui_sheet_retina.json';

export type UiFrame = keyof typeof uiAtlas.frames & keyof typeof uiAtlasRetina.frames;

interface AtlasChoice {
  frames: Record<UiFrame, { frame: { x: number; y: number; w: number; h: number } }>;
  size: { w: number; h: number };
  /** Atlas pixels per CSS pixel. */
  density: number;
  image: string;
}

const base = import.meta.env.BASE_URL;

/**
 * The retina atlas is packed independently (frames are not simply at 2x the
 * 1x coordinates), so pick one atlas for the display density and use its own
 * coordinates.
 */
function chooseAtlas(): AtlasChoice {
  const retina = typeof window !== 'undefined' && window.devicePixelRatio > 1.25;
  return retina
    ? {
        frames: uiAtlasRetina.frames,
        size: uiAtlasRetina.meta.size,
        density: 2,
        image: `url("${base}game/atlas/ui@2x.png")`,
      }
    : {
        frames: uiAtlas.frames,
        size: uiAtlas.meta.size,
        density: 1,
        image: `url("${base}game/atlas/ui.png")`,
      };
}

const atlas = chooseAtlas();

/** CSS background for a UI atlas frame rendered at `width` CSS pixels (keeps aspect). */
export function uiSpriteStyle(name: UiFrame, width?: number): CSSProperties {
  const { frame } = atlas.frames[name];
  const logicalWidth = frame.w / atlas.density;
  const k = (width ?? logicalWidth) / logicalWidth / atlas.density;
  return {
    width: frame.w * k,
    height: frame.h * k,
    backgroundImage: atlas.image,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: `${-frame.x * k}px ${-frame.y * k}px`,
    backgroundSize: `${atlas.size.w * k}px ${atlas.size.h * k}px`,
  };
}
