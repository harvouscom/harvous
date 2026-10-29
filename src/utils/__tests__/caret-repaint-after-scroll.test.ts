import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorView } from '@tiptap/pm/view';
import { repaintNativeCaretAfterScroll } from '../caret-clear-of-format-bar';

/**
 * iOS leaves the painted caret where it was when a scroller is scrolled from script, so after
 * the format-bar clearance scroll the caret sat a line off from where typing landed. The fix
 * re-asserts the same DOM selection a frame later.
 */
let dom: HTMLElement;
let frames: FrameRequestCallback[] = [];

function fakeView(focused = true): EditorView {
  return { dom, hasFocus: () => focused, isDestroyed: false } as unknown as EditorView;
}

beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  dom = document.createElement('div');
  dom.textContent = 'Moses comes down the mountain and sees';
  document.body.append(dom);
  const sel = document.getSelection()!;
  sel.collapse(dom.firstChild!, 38);
});

afterEach(() => {
  dom.remove();
  vi.unstubAllGlobals();
});

describe('repaintNativeCaretAfterScroll', () => {
  it('re-asserts the same selection on iOS', () => {
    vi.stubGlobal('navigator', { userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 5 });
    const spy = vi.spyOn(Selection.prototype, 'setBaseAndExtent');
    repaintNativeCaretAfterScroll(fakeView());
    frames.forEach((cb) => cb(0));
    expect(spy).toHaveBeenCalledWith(dom.firstChild, 38, dom.firstChild, 38);
    spy.mockRestore();
  });

  it('does nothing on desktop, or when the editor lost focus', () => {
    const spy = vi.spyOn(Selection.prototype, 'setBaseAndExtent');
    vi.stubGlobal('navigator', { userAgent: 'Mac', platform: 'MacIntel', maxTouchPoints: 0 });
    repaintNativeCaretAfterScroll(fakeView());
    expect(frames).toHaveLength(0);
    vi.stubGlobal('navigator', { userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 5 });
    repaintNativeCaretAfterScroll(fakeView(false));
    frames.forEach((cb) => cb(0));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
