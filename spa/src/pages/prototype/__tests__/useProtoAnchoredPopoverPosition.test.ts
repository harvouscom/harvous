import { describe, expect, it } from 'vitest';
import { resolveAnchorRect } from '../useProtoAnchoredPopoverPosition';

describe('resolveAnchorRect', () => {
  it('prefers live connected anchor element over static rect', () => {
    const el = document.createElement('button');
    document.body.appendChild(el);
    el.getBoundingClientRect = () =>
      ({
        top: 10,
        left: 20,
        bottom: 30,
        right: 40,
        width: 20,
        height: 20,
        x: 20,
        y: 10,
        toJSON: () => ({}),
      }) as DOMRect;

    const fallback = {
      top: 100,
      left: 100,
      bottom: 120,
      right: 120,
      width: 20,
      height: 20,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect;

    expect(resolveAnchorRect(el, fallback)?.top).toBe(10);
    el.remove();
  });

  it('falls back to anchorRect when element is missing or disconnected', () => {
    const fallback = {
      top: 55,
      left: 66,
      bottom: 77,
      right: 88,
      width: 22,
      height: 22,
      x: 66,
      y: 55,
      toJSON: () => ({}),
    } as DOMRect;

    expect(resolveAnchorRect(null, fallback)?.left).toBe(66);
    expect(resolveAnchorRect(undefined, fallback)?.left).toBe(66);

    const detached = document.createElement('button');
    expect(resolveAnchorRect(detached, fallback)?.left).toBe(66);
  });
});
