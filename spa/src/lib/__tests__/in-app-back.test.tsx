import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  SHELL_SWITCH_STATE,
  previousDocumentEntry,
  recordInAppLocation,
  useStandaloneEdgeSwipeBack,
} from '../in-app-back';

/** The installed iPhone app has no browser back; these pin the two ways back it now has. */
function at(index: number, state: object = {}) {
  window.history.replaceState({ ...state, __TSR_index: index }, '');
}

function touch(type: string, x: number, y: number) {
  const t = { clientX: x, clientY: y } as Touch;
  const e = new Event(type, { bubbles: true }) as TouchEvent;
  Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : [t] });
  Object.defineProperty(e, 'changedTouches', { value: [t] });
  document.dispatchEvent(e);
}

beforeEach(() => {
  sessionStorage.clear();
  document.documentElement.classList.add('ios-pwa');
});

afterEach(() => {
  document.documentElement.classList.remove('ios-pwa');
  at(0);
  vi.restoreAllMocks();
});

describe('previousDocumentEntry', () => {
  it('names the note you came from', () => {
    at(0);
    recordInAppLocation('/fixY3dC');
    at(1);
    recordInAppLocation('/fg5fOyI');
    expect(previousDocumentEntry('/fg5fOyI')?.path).toBe('/fixY3dC');
  });

  it('is nothing at the first entry, or when the previous page was Home', () => {
    at(0);
    recordInAppLocation('/');
    expect(previousDocumentEntry('/')).toBeNull();
    at(1);
    recordInAppLocation('/fg5fOyI');
    expect(previousDocumentEntry('/fg5fOyI')).toBeNull();
  });

  it('is nothing when the Activity / Note / Bible switch made the move', () => {
    at(0);
    recordInAppLocation('/read/john/3');
    at(1, SHELL_SWITCH_STATE);
    recordInAppLocation('/');
    expect(previousDocumentEntry('/')).toBeNull();
    at(2, SHELL_SWITCH_STATE);
    recordInAppLocation('/fixY3dC');
    expect(previousDocumentEntry('/fixY3dC')).toBeNull();
  });

  it('still names the chapter when you drilled into a note from it', () => {
    at(0, SHELL_SWITCH_STATE);
    recordInAppLocation('/read/john/3');
    at(1);
    recordInAppLocation('/fixY3dC');
    expect(previousDocumentEntry('/fixY3dC')?.path).toBe('/read/john/3');
  });
});

describe('useStandaloneEdgeSwipeBack', () => {
  it('a swipe from the left edge goes back', () => {
    at(2);
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    renderHook(() => useStandaloneEdgeSwipeBack());
    touch('touchstart', 8, 300);
    touch('touchmove', 60, 305);
    touch('touchend', 90, 306);
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('ignores touches away from the edge, vertical drags, and the first entry', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    renderHook(() => useStandaloneEdgeSwipeBack());
    at(2);
    touch('touchstart', 120, 300);
    touch('touchend', 260, 300);
    touch('touchstart', 8, 300);
    touch('touchmove', 30, 420);
    touch('touchend', 80, 460);
    at(0);
    touch('touchstart', 8, 300);
    touch('touchend', 120, 300);
    expect(back).not.toHaveBeenCalled();
  });
});
