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
    expect(onContentChange).toHaveBeenCalledWith('<p>final keystroke</p>');
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

  it('mirrorEditContentRef updates ref before React re-render', () => {
    const editContentRef = { current: '<p>old</p>' };

    mirrorEditContentRef(editContentRef, '<p>new</p>');

    expect(editContentRef.current).toBe('<p>new</p>');
  });
});
