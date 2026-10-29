import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/utils/study-dock-layout', () => ({ updateStudyDockExpandedMaxHeight: vi.fn() }));
vi.mock('@/utils/proto-viewport-settle', () => ({ emitProtoViewportSettle: vi.fn() }));

import { useMobileKeyboardFrame } from '../useMobileKeyboardFrame';

/**
 * "Half the screen is clipped" on Home and the reader after typing.
 *
 * Saving a compose blurs the editor (focusout queues a settle pass for the next frame) in the
 * same tick the shell stops hosting the editor (the effect cleans up). The queued pass used to
 * outlive the cleanup and write the keyboard-height frame back with nothing left to undo it.
 */
class FakeVisualViewport extends EventTarget {
  height = 812;
  offsetTop = 0;
}

let frames: Array<FrameRequestCallback | null> = [];
let vv: FakeVisualViewport;
let frame: HTMLElement;
let editor: HTMLElement;

function flushFrames() {
  const pending = frames;
  frames = [];
  pending.forEach((cb) => cb?.(0));
}

beforeEach(() => {
  vi.useFakeTimers();
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames[id - 1] = null;
  });
  vv = new FakeVisualViewport();
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 812, configurable: true });
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} }));
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  frame = document.createElement('div');
  frame.className = 'proto-shell-frame';
  editor = document.createElement('div');
  editor.contentEditable = 'true';
  editor.tabIndex = 0;
  document.body.append(frame, editor);
});

afterEach(() => {
  frame.remove();
  editor.remove();
  document.documentElement.removeAttribute('data-proto-keyboard-open');
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function openKeyboard() {
  // jsdom has no layout, so isContentEditable is never true; stand in for a focused editor.
  Object.defineProperty(editor, 'isContentEditable', { value: true, configurable: true });
  editor.focus();
  vv.height = 400;
  vv.dispatchEvent(new Event('resize'));
}

describe('useMobileKeyboardFrame', () => {
  it('sizes the frame to the visual viewport while an editor has focus', () => {
    renderHook(() => useMobileKeyboardFrame(true));
    openKeyboard();
    expect(document.documentElement.hasAttribute('data-proto-keyboard-open')).toBe(true);
    expect(frame.style.height).toBe('384px');
  });

  it('a settle pass queued by focusout cannot resurrect the frame after unmount', () => {
    const { rerender } = renderHook(({ active }) => useMobileKeyboardFrame(active), {
      initialProps: { active: true },
    });
    openKeyboard();
    // The save: focus leaves the editor (settle queued)… while the keyboard is still up…
    editor.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    // …and the route stops hosting the editor in the same tick.
    rerender({ active: false });
    expect(frame.style.height).toBe('');
    flushFrames();
    vi.runAllTimers();
    expect(frame.style.height).toBe('');
    expect(document.documentElement.hasAttribute('data-proto-keyboard-open')).toBe(false);
  });

  it('a short visual viewport with nothing focused is not a keyboard', () => {
    renderHook(() => useMobileKeyboardFrame(true));
    openKeyboard();
    editor.blur();
    // iOS left vv.height short after the keyboard closed (e.g. resumed from background).
    document.dispatchEvent(new Event('visibilitychange'));
    flushFrames();
    expect(frame.style.height).toBe('');
    expect(document.documentElement.hasAttribute('data-proto-keyboard-open')).toBe(false);
  });

  it('clears a frame some other writer left behind when no editor is hosted', () => {
    document.documentElement.setAttribute('data-proto-keyboard-open', '');
    frame.style.height = '384px';
    renderHook(() => useMobileKeyboardFrame(false));
    expect(frame.style.height).toBe('');
    expect(document.documentElement.hasAttribute('data-proto-keyboard-open')).toBe(false);
  });
});
