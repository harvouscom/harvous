import { describe, expect, it, afterEach } from 'vitest';
import {
  computeAnchoredPopoverPosition,
  computeRightAnchoredPopoverPosition,
} from '../anchored-popover-position';

const rect = (r: Partial<DOMRect>): DOMRect =>
  ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}), ...r }) as DOMRect;

function setViewport(opts: { innerHeight: number; innerWidth: number; vv?: { height: number; offsetTop: number } }) {
  Object.defineProperty(window, 'innerHeight', { value: opts.innerHeight, configurable: true });
  Object.defineProperty(window, 'innerWidth', { value: opts.innerWidth, configurable: true });
  Object.defineProperty(window, 'visualViewport', {
    value: opts.vv
      ? { height: opts.vv.height, width: opts.innerWidth, offsetTop: opts.vv.offsetTop, offsetLeft: 0 }
      : undefined,
    configurable: true,
  });
}

afterEach(() => setViewport({ innerHeight: 768, innerWidth: 1024 }));

describe('anchored popovers clamp to what is actually on screen', () => {
  it('opens below when the space below is genuinely visible', () => {
    setViewport({ innerHeight: 800, innerWidth: 390, vv: { height: 800, offsetTop: 0 } });
    const pos = computeAnchoredPopoverPosition(rect({ top: 100, bottom: 130, left: 40, width: 60 }), 200, 300);
    expect(pos.placement).toBe('below');
  });

  it('flips above when the space below is behind the keyboard', () => {
    // Layout viewport still 800 tall; only ~350 of it is on screen. The old code read
    // innerHeight, decided 300px "fits below", and rendered the menu under the keyboard.
    setViewport({ innerHeight: 800, innerWidth: 390, vv: { height: 350, offsetTop: 0 } });
    const pos = computeAnchoredPopoverPosition(rect({ top: 100, bottom: 130, left: 40, width: 60 }), 200, 300);
    expect(pos.placement).toBe('above');
  });

  it('clamps a flipped card to the visible top, not the layout top', () => {
    // iOS can pan the visual viewport down to reveal the caret; the band starts at offsetTop.
    setViewport({ innerHeight: 800, innerWidth: 390, vv: { height: 350, offsetTop: 120 } });
    const pos = computeAnchoredPopoverPosition(rect({ top: 140, bottom: 170, left: 40, width: 60 }), 200, 300);
    expect(pos.top).toBeGreaterThanOrEqual(120);
  });

  it('applies the same band to the right-anchored variant', () => {
    setViewport({ innerHeight: 800, innerWidth: 390, vv: { height: 350, offsetTop: 0 } });
    const pos = computeRightAnchoredPopoverPosition(rect({ top: 100, bottom: 130, right: 380, width: 60 }), 200, 300);
    expect(pos.placement).toBe('above');
  });

  it('falls back to the layout viewport when there is no visualViewport at all', () => {
    setViewport({ innerHeight: 800, innerWidth: 390 });
    const pos = computeAnchoredPopoverPosition(rect({ top: 100, bottom: 130, left: 40, width: 60 }), 200, 300);
    expect(pos.placement).toBe('below');
  });
});
