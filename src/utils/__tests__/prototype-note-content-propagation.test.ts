import { describe, expect, it, vi } from 'vitest';
import {
  flushCoalescedNoteHtmlOnUnmount,
  mirrorEditContentRef,
} from '../prototype-note-content-propagation';

describe('prototype note content propagation', () => {
  it('flushCoalescedNoteHtmlOnUnmount cancels RAF then delivers latest HTML', () => {
    const cancel = vi.fn();
    const onContentChange = vi.fn();
    const rafId = 42;

    flushCoalescedNoteHtmlOnUnmount({
      pendingRafId: rafId,
      latestHtml: '<p>final keystroke</p>',
      onContentChange,
      cancelAnimationFrame: cancel,
    });

    expect(cancel).toHaveBeenCalledWith(rafId);
    // Unmount flushes without an explicit `wasUserEdit: true` are programmatic (not a live
    // keystroke), so a `{ programmatic: true }` meta accompanies the flushed HTML.
    expect(onContentChange).toHaveBeenCalledWith('<p>final keystroke</p>', { programmatic: true });
  });

  it('flushCoalescedNoteHtmlOnUnmount skips onContentChange when latest HTML is empty', () => {
    const onContentChange = vi.fn();

    flushCoalescedNoteHtmlOnUnmount({
      pendingRafId: null,
      latestHtml: '',
      onContentChange,
      cancelAnimationFrame: vi.fn(),
    });

    expect(onContentChange).not.toHaveBeenCalled();
  });

  it('flushCoalescedNoteHtmlOnUnmount requires window-bound cancelAnimationFrame', () => {
    const strictCancel = function (this: unknown, _id: number) {
      if (this !== globalThis) {
        throw new TypeError('Can only call Window.cancelAnimationFrame on instances of Window');
      }
    };

    expect(() => {
      flushCoalescedNoteHtmlOnUnmount({
        pendingRafId: 1,
        latestHtml: '<p>x</p>',
        onContentChange: vi.fn(),
        cancelAnimationFrame: strictCancel as typeof cancelAnimationFrame,
      });
    }).toThrow(/cancelAnimationFrame/);

    const boundCancel = vi.fn();
    flushCoalescedNoteHtmlOnUnmount({
      pendingRafId: 2,
      latestHtml: '<p>y</p>',
      onContentChange: vi.fn(),
      cancelAnimationFrame: (id) => boundCancel(id),
    });
    expect(boundCancel).toHaveBeenCalledWith(2);
  });

  it('mirrorEditContentRef updates ref before React re-render', () => {
    const editContentRef = { current: '<p>old</p>' };

    mirrorEditContentRef(editContentRef, '<p>new</p>');

    expect(editContentRef.current).toBe('<p>new</p>');
  });
});
