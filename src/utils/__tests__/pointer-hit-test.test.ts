import { describe, expect, it } from 'vitest';
import { pointerIsInsideElementRect, isTouchPointerEvent } from '../pointer-hit-test';

/** A word-sized inline target: the ~19px box a dotted reference suggestion actually occupies. */
function inlineWord(): HTMLElement {
  const el = document.createElement('span');
  el.getBoundingClientRect = () =>
    ({ top: 100, bottom: 119, left: 40, right: 108, width: 68, height: 19, x: 40, y: 100, toJSON: () => ({}) }) as DOMRect;
  return el;
}

const mouseAt = (x: number, y: number) => new MouseEvent('click', { clientX: x, clientY: y });

function touchAt(x: number, y: number): TouchEvent {
  // jsdom has no Touch constructor; the reader only needs clientX/clientY off changedTouches.
  return { changedTouches: [{ clientX: x, clientY: y }], type: 'touchstart' } as unknown as TouchEvent;
}

describe('isTouchPointerEvent', () => {
  it('recognizes a touch event by its touch lists', () => {
    expect(isTouchPointerEvent(touchAt(60, 110))).toBe(true);
  });

  it('does not mistake a plain mouse click for a finger', () => {
    expect(isTouchPointerEvent(mouseAt(60, 110))).toBe(false);
  });

  it('reads pointerType when the event carries one', () => {
    expect(isTouchPointerEvent({ pointerType: 'touch' } as PointerEvent)).toBe(true);
    expect(isTouchPointerEvent({ pointerType: 'mouse' } as PointerEvent)).toBe(false);
  });
});

describe('pointerIsInsideElementRect', () => {
  it('accepts a hit inside the box for either input', () => {
    expect(pointerIsInsideElementRect(mouseAt(60, 110), inlineWord())).toBe(true);
    expect(pointerIsInsideElementRect(touchAt(60, 110), inlineWord())).toBe(true);
  });

  it('gives a finger vertical slop the mouse does not get', () => {
    // 6px below the box: within a finger's contact patch, outside a cursor's intent.
    // The old predicate checked `pointerType` on a MouseEvent|TouchEvent — a property
    // neither has — so this padding was dead and the tap simply missed.
    expect(pointerIsInsideElementRect(touchAt(60, 125), inlineWord())).toBe(true);
    expect(pointerIsInsideElementRect(mouseAt(60, 125), inlineWord())).toBe(false);
  });

  it('still rejects a touch well outside the box', () => {
    expect(pointerIsInsideElementRect(touchAt(60, 140), inlineWord())).toBe(false);
  });

  it('does not pad horizontally, where the neighbouring word begins', () => {
    expect(pointerIsInsideElementRect(touchAt(112, 110), inlineWord())).toBe(false);
  });

  it('accepts an event with no coordinates — it never aimed at a point', () => {
    expect(pointerIsInsideElementRect({ type: 'click' } as MouseEvent, inlineWord())).toBe(true);
  });
});
