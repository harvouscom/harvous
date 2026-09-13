import { describe, expect, it } from 'vitest';
import { isSubmitKey, isTypingTarget, nextBlankIndex } from '../review-dock-keys';

describe('Enter submits a typed answer', () => {
  it('on a plain Enter', () => {
    expect(isSubmitKey({ key: 'Enter', shiftKey: false })).toBe(true);
  });

  it('never on Shift+Enter, which is how a line break is asked for', () => {
    expect(isSubmitKey({ key: 'Enter', shiftKey: true })).toBe(false);
  });

  it('never while an input method is composing', () => {
    /*
     * Enter is how a Japanese, Chinese or Korean reader accepts the candidate they are part-way
     * through choosing. Submitting there would spend one of their goes on a half-typed word.
     */
    expect(isSubmitKey({ key: 'Enter', shiftKey: false, isComposing: true })).toBe(false);
    // React's synthetic event does not always carry the flag; the native one does.
    expect(
      isSubmitKey({ key: 'Enter', shiftKey: false, nativeEvent: { isComposing: true } }),
    ).toBe(false);
  });

  it('ignores every other key', () => {
    for (const key of ['a', 'Tab', 'Escape', 'NumpadEnter']) {
      expect(isSubmitKey({ key, shiftKey: false })).toBe(false);
    }
  });
});

describe('Enter moves to the next gap still to fill', () => {
  it('walks forward past the ones already filled', () => {
    expect(nextBlankIndex(['a', '', ''], 0, 3)).toBe(1);
    expect(nextBlankIndex(['a', 'b', ''], 0, 3)).toBe(2);
  });

  it('wraps once, to catch a gap skipped on the way down', () => {
    expect(nextBlankIndex(['', 'b', 'c'], 2, 3)).toBe(0);
  });

  it('answers null when every gap is filled, which is when the answer is ready', () => {
    expect(nextBlankIndex(['a', 'b', 'c'], 0, 3)).toBeNull();
  });

  it('treats whitespace as unfilled', () => {
    expect(nextBlankIndex(['a', '   ', 'c'], 0, 3)).toBe(1);
  });
});

describe('Escape leaves someone typing alone', () => {
  it('knows the places a reader types', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      expect(isTypingTarget(document.createElement(tag))).toBe(true);
    }
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    // jsdom does not derive `isContentEditable`, so assert the branch we can.
    expect(isTypingTarget(document.createElement('div'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
