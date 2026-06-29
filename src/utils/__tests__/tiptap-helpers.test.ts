import { describe, expect, it } from 'vitest';
import { isTiptapViewReady } from '../tiptap-helpers';

describe('isTiptapViewReady', () => {
  it('returns false for null/undefined', () => {
    expect(isTiptapViewReady(null)).toBe(false);
    expect(isTiptapViewReady(undefined)).toBe(false);
  });

  it('returns false when editor is destroyed', () => {
    expect(isTiptapViewReady({ isDestroyed: true, view: { docView: {} } })).toBe(false);
  });

  it('returns false when view getter throws (pre-mount TipTap)', () => {
    const editor = {
      isDestroyed: false,
      get view() {
        throw new Error('[tiptap error]: The editor view is not available. Cannot access editor.view');
      },
    };
    expect(() => isTiptapViewReady(editor)).not.toThrow();
    expect(isTiptapViewReady(editor)).toBe(false);
  });

  it('returns false when docView is missing', () => {
    expect(isTiptapViewReady({ isDestroyed: false, view: {} })).toBe(false);
    expect(isTiptapViewReady({ isDestroyed: false, view: { docView: null } })).toBe(false);
  });

  it('returns true when view and docView exist', () => {
    expect(isTiptapViewReady({ isDestroyed: false, view: { docView: {} } })).toBe(true);
  });
});
