import { describe, expect, it } from 'vitest';
import { circleIntersectsRect } from '../../src/ui/game/obscure';

const rect = { left: 10, top: 10, right: 110, bottom: 50 };

describe('circleIntersectsRect', () => {
  it('detects a circle inside or overlapping the rect', () => {
    expect(circleIntersectsRect({ x: 60, y: 30, r: 5 }, rect)).toBe(true);
    expect(circleIntersectsRect({ x: 0, y: 30, r: 12 }, rect)).toBe(true);
  });

  it('ignores a circle clear of the rect', () => {
    expect(circleIntersectsRect({ x: 0, y: 30, r: 9 }, rect)).toBe(false);
    // Near a corner: inside the bounding box test, outside the true distance.
    expect(circleIntersectsRect({ x: 117, y: 57, r: 9 }, rect)).toBe(false);
  });

  it('grows the rect by the margin', () => {
    expect(circleIntersectsRect({ x: 0, y: 30, r: 9 }, rect, 2)).toBe(true);
  });
});
