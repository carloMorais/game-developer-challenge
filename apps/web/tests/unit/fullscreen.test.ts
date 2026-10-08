import { describe, expect, it } from 'vitest';
import { canFullscreen, isFullscreen } from '../../src/lib/fullscreen';

function fakeDocument(fields: Record<string, unknown>, element: Record<string, unknown> = {}) {
  return { documentElement: element, ...fields } as unknown as Document;
}

describe('fullscreen feature detection', () => {
  it('supports the standard API', () => {
    const doc = fakeDocument({ fullscreenEnabled: true }, { requestFullscreen: () => {} });
    expect(canFullscreen(doc)).toBe(true);
  });

  it('supports the WebKit-prefixed API', () => {
    const doc = fakeDocument(
      { webkitFullscreenEnabled: true },
      { webkitRequestFullscreen: () => {} },
    );
    expect(canFullscreen(doc)).toBe(true);
  });

  it('reports no support when disabled or missing (iPhone, iframes)', () => {
    expect(
      canFullscreen(fakeDocument({ fullscreenEnabled: false }, { requestFullscreen: () => {} })),
    ).toBe(false);
    expect(canFullscreen(fakeDocument({ fullscreenEnabled: true }))).toBe(false);
  });

  it('reads the current fullscreen element, prefixed or not', () => {
    expect(isFullscreen(fakeDocument({ fullscreenElement: null }))).toBe(false);
    expect(isFullscreen(fakeDocument({ fullscreenElement: {} }))).toBe(true);
    expect(isFullscreen(fakeDocument({ webkitFullscreenElement: {} }))).toBe(true);
  });
});
