import { describe, it, expect } from 'vitest';
import { getVisualViewportBox, visualViewportOverlayStyle } from '../visual-viewport-box';

/** Minimal window stand-in — only the fields the helper reads. */
function fakeWindow(opts: {
  innerWidth: number;
  innerHeight: number;
  vv?: { offsetTop?: number; offsetLeft?: number; width?: number; height?: number };
}): Window {
  return {
    innerWidth: opts.innerWidth,
    innerHeight: opts.innerHeight,
    visualViewport: opts.vv,
  } as unknown as Window;
}

describe('getVisualViewportBox', () => {
  it('falls back to the window box when visualViewport is unavailable', () => {
    const box = getVisualViewportBox(fakeWindow({ innerWidth: 390, innerHeight: 844 }));
    expect(box).toEqual({ top: 0, left: 0, width: 390, height: 844, keyboardLikely: false });
  });

  it('reports the visible area when the keyboard is up', () => {
    // iPhone 14: 844pt window, ~336pt of keyboard + accessory bar.
    const box = getVisualViewportBox(
      fakeWindow({ innerWidth: 390, innerHeight: 844, vv: { width: 390, height: 508 } }),
    );
    expect(box.height).toBe(508);
    expect(box.keyboardLikely).toBe(true);
  });

  it('carries the visual viewport offset (page scrolled under a pinned keyboard)', () => {
    const box = getVisualViewportBox(
      fakeWindow({
        innerWidth: 390,
        innerHeight: 844,
        vv: { offsetTop: 120, offsetLeft: 4, width: 390, height: 508 },
      }),
    );
    expect(box.top).toBe(120);
    expect(box.left).toBe(4);
  });

  it('does not call browser chrome a keyboard', () => {
    // Safari's collapsing toolbar is a ~60pt difference — well under the threshold.
    const box = getVisualViewportBox(
      fakeWindow({ innerWidth: 390, innerHeight: 844, vv: { width: 390, height: 784 } }),
    );
    expect(box.keyboardLikely).toBe(false);
  });

  it('treats an absent window (SSR) as an empty box rather than throwing', () => {
    expect(() => getVisualViewportBox(null)).not.toThrow();
    expect(getVisualViewportBox(null)).toEqual({
      top: 0,
      left: 0,
      width: 0,
      height: 0,
      keyboardLikely: false,
    });
  });

  it('falls back to the global window when called with no argument', () => {
    expect(() => getVisualViewportBox()).not.toThrow();
  });
});

describe('visualViewportOverlayStyle', () => {
  it('pins a fixed overlay to the visible area', () => {
    const box = getVisualViewportBox(
      fakeWindow({
        innerWidth: 390,
        innerHeight: 844,
        vv: { offsetTop: 120, offsetLeft: 0, width: 390, height: 508 },
      }),
    );
    expect(visualViewportOverlayStyle(box)).toEqual({
      position: 'fixed',
      top: 120,
      left: 0,
      width: 390,
      height: 508,
    });
  });

  it('bottom edge of the overlay lands above the keyboard', () => {
    const box = getVisualViewportBox(
      fakeWindow({ innerWidth: 390, innerHeight: 844, vv: { offsetTop: 0, width: 390, height: 508 } }),
    );
    const style = visualViewportOverlayStyle(box);
    // A flex-end child sits at top + height — which must clear the 844pt layout-viewport bottom
    // that `position: fixed; inset: 0` would otherwise have used (i.e. behind the keyboard).
    expect(style.top + style.height).toBe(508);
    expect(style.top + style.height).toBeLessThan(844);
  });
});
