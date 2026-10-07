export interface Viewport {
  /** World-to-screen scale (CSS pixels per world pixel). */
  scale: number;
  /** Screen-space offset of the world's top-left corner, in CSS pixels. */
  offsetX: number;
  offsetY: number;
}

/**
 * Fits the fixed-size world into the screen, preserving its aspect ratio and
 * centring it (letterbox). Arena limits and rules never depend on screen size.
 */
export function fitViewport(
  screenWidth: number,
  screenHeight: number,
  worldWidth: number,
  worldHeight: number,
): Viewport {
  const scale = Math.max(0.01, Math.min(screenWidth / worldWidth, screenHeight / worldHeight));
  return {
    scale,
    offsetX: (screenWidth - worldWidth * scale) / 2,
    offsetY: (screenHeight - worldHeight * scale) / 2,
  };
}

/** Converts a screen point (CSS pixels, relative to the canvas) to world space. */
export function screenToWorld(viewport: Viewport, x: number, y: number): { x: number; y: number } {
  return {
    x: (x - viewport.offsetX) / viewport.scale,
    y: (y - viewport.offsetY) / viewport.scale,
  };
}

/** Screen space kept free of the arena (e.g. for touch controls), in CSS pixels. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSETS: Readonly<Insets> = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });
