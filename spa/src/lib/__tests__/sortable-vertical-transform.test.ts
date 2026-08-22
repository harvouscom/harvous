import { describe, expect, it } from 'vitest';
import { verticalDragTransform } from '../sortable-vertical-transform';

/**
 * A vertical sortable row must not follow the pointer sideways.
 *
 * dnd-kit measures both axes and `CSS.Transform.toString` writes both out, so a row in a
 * `verticalListSortingStrategy` list drifted horizontally out of its own menu while dragging.
 * Two lists had it — the space switcher and the thread trail — because both wrote the transform
 * the same way, which is why the constraint lives in one helper now.
 */
describe('verticalDragTransform', () => {
  it('drops sideways movement while keeping the vertical', () => {
    const out = verticalDragTransform({ x: 137, y: 42, scaleX: 1, scaleY: 1 });
    expect(out).toContain('translate3d(0px, 42px');
    expect(out).not.toContain('137');
  });

  it('drops it in the other direction too', () => {
    const out = verticalDragTransform({ x: -96, y: -18, scaleX: 1, scaleY: 1 });
    expect(out).toContain('translate3d(0px, -18px');
    expect(out).not.toContain('-96');
  });

  it('leaves a purely vertical drag exactly as it was', () => {
    expect(verticalDragTransform({ x: 0, y: 24, scaleX: 1, scaleY: 1 })).toContain(
      'translate3d(0px, 24px',
    );
  });

  /** Scale is deliberately preserved — changing it would be a second, unrelated change. */
  it('keeps whatever scale dnd-kit asked for', () => {
    const out = verticalDragTransform({ x: 10, y: 0, scaleX: 1.05, scaleY: 0.95 });
    expect(out).toContain('scaleX(1.05)');
    expect(out).toContain('scaleY(0.95)');
  });

  it('returns undefined when there is no drag, so no transform is written at all', () => {
    expect(verticalDragTransform(null)).toBeUndefined();
  });
});
