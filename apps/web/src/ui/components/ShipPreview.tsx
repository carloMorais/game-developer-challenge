import type { CSSProperties } from 'react';
import shipsXml from '../../../../../assets/spritesheet/ships_miscellaneous_sheet.xml?raw';
import {
  SHIP_LAYOUT,
  cannonPlacement,
  flagFrame,
  hullFrame,
  sailFrame,
  smallSailFrame,
} from '../../game/render/theme';
import type { ShipLook } from '../../game/shipLook';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Frame rects from the same source atlas the game uses. */
const FRAMES: Record<string, Rect> = {};
for (const [, name, x, y, w, h] of shipsXml.matchAll(
  /<SubTexture\s+name="([^"]+)"\s+x="(\d+)"\s+y="(\d+)"\s+width="(\d+)"\s+height="(\d+)"/g,
)) {
  FRAMES[name!.replace(/\.png$/, '')] = { x: +x!, y: +y!, w: +w!, h: +h! };
}

const IMAGE = `url("${import.meta.env.BASE_URL}game/atlas/ships.png")`;
/** Source ship sprite box (66x113 art pixels). */
const BOX = { w: 66, h: 113 };

function Part({
  frame,
  at,
  rotation = 0,
  scale,
}: {
  frame: string;
  at: { x: number; y: number };
  rotation?: number;
  scale: number;
}) {
  const rect = FRAMES[frame];
  if (!rect) return null;
  const style: CSSProperties = {
    position: 'absolute',
    left: (BOX.w / 2 + at.x - rect.w / 2) * scale,
    top: (BOX.h / 2 + at.y - rect.h / 2) * scale,
    width: rect.w * scale,
    height: rect.h * scale,
    backgroundImage: IMAGE,
    backgroundPosition: `${-rect.x * scale}px ${-rect.y * scale}px`,
    backgroundSize: `${1024 * scale}px auto`,
    transform: rotation ? `rotate(${rotation}rad)` : undefined,
  };
  return <span style={style} />;
}

/** The ship as assembled in battle (intact, bow down), drawn from atlas parts. */
export function ShipPreview({ look, scale = 1.4 }: { look: ShipLook; scale?: number }) {
  const small = smallSailFrame(look, 0);
  const cannons = {
    front: cannonPlacement(look, 'front'),
    port: cannonPlacement(look, 'port'),
    starboard: cannonPlacement(look, 'starboard'),
  };
  return (
    <div
      className="ship-preview"
      style={{ width: BOX.w * scale, height: BOX.h * scale }}
      aria-hidden="true"
      data-testid="ship-preview"
    >
      <Part frame={hullFrame(look, 0)} at={SHIP_LAYOUT.hull} scale={scale} />
      <Part
        frame="cannon_loose"
        at={cannons.front}
        rotation={cannons.front.rotation}
        scale={scale}
      />
      <Part frame="cannon_loose" at={cannons.port} rotation={cannons.port.rotation} scale={scale} />
      <Part
        frame="cannon_loose"
        at={cannons.starboard}
        rotation={cannons.starboard.rotation}
        scale={scale}
      />
      {small && <Part frame={small} at={SHIP_LAYOUT.smallSail} scale={scale} />}
      <Part frame={sailFrame(look, 0)} at={SHIP_LAYOUT.sail} scale={scale} />
      <Part frame={flagFrame(look, 0)} at={SHIP_LAYOUT.flag} scale={scale} />
    </div>
  );
}
