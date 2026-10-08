/** A circle in screen (CSS) pixels, relative to the viewport. */
export interface ScreenCircle {
  x: number;
  y: number;
  r: number;
}

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** True when the circle touches the rect grown by `margin` on every side. */
export function circleIntersectsRect(circle: ScreenCircle, rect: ScreenRect, margin = 0): boolean {
  const nearestX = Math.max(rect.left - margin, Math.min(circle.x, rect.right + margin));
  const nearestY = Math.max(rect.top - margin, Math.min(circle.y, rect.bottom + margin));
  const dx = circle.x - nearestX;
  const dy = circle.y - nearestY;
  return dx * dx + dy * dy <= circle.r * circle.r;
}

/** Elements that fade when a ship sails under them. */
export const OBSCURABLE_SELECTOR = '[data-obscurable]';
const MARGIN = 6;

/**
 * Marks HUD elements and touch clusters with `data-obscured="true"` while a
 * ship is underneath, so the CSS can fade them. Element rects are cached and
 * only measured again after a resize; attributes are set directly (no React
 * render per frame).
 */
export class ObscureWatcher {
  private rects = new WeakMap<Element, ScreenRect>();
  private readonly observer: ResizeObserver | null;
  private readonly onResize = () => {
    this.rects = new WeakMap();
  };

  constructor(private readonly root: HTMLElement) {
    this.observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(this.onResize);
    window.addEventListener('resize', this.onResize);
  }

  update(circles: readonly ScreenCircle[]): void {
    for (const el of this.root.querySelectorAll<HTMLElement>(OBSCURABLE_SELECTOR)) {
      let rect = this.rects.get(el);
      if (!rect) {
        const box = el.getBoundingClientRect();
        rect = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
        this.rects.set(el, rect);
        this.observer?.observe(el);
      }
      const hit = circles.some((c) => circleIntersectsRect(c, rect, MARGIN));
      if (hit !== (el.dataset.obscured === 'true')) {
        if (hit) el.dataset.obscured = 'true';
        else delete el.dataset.obscured;
      }
    }
  }

  dispose(): void {
    this.observer?.disconnect();
    window.removeEventListener('resize', this.onResize);
  }
}
