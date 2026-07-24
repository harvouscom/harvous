import { describe, expect, it } from 'vitest';
import { getTiptapEditorDomId, getTiptapView, isTiptapViewReady } from '../tiptap-helpers';

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

function preMountEditor() {
  return {
    isDestroyed: false,
    get view() {
      throw new Error('[tiptap error]: The editor view is not available. Cannot access editor.view');
    },
  };
}

describe('getTiptapView', () => {
  it('returns null when view getter throws (pre-mount TipTap)', () => {
    const editor = preMountEditor();
    expect(() => getTiptapView(editor)).not.toThrow();
    expect(getTiptapView(editor)).toBeNull();
  });

  it('returns view when mounted', () => {
    const view = { docView: {}, dom: { id: 'edit-note-content' } };
    expect(getTiptapView({ isDestroyed: false, view })).toBe(view);
  });
});

describe('getTiptapEditorDomId', () => {
  it('returns fallback when view is not ready', () => {
    const editor = {
      isDestroyed: false,
      get view() {
        throw new Error('[tiptap error]: The editor view is not available. Cannot access view[\'dom\']');
      },
    };
    expect(() => getTiptapEditorDomId(editor)).not.toThrow();
    expect(getTiptapEditorDomId(editor)).toBe('default');
    expect(getTiptapEditorDomId(editor, 'edit-note-content')).toBe('edit-note-content');
  });

  it('returns dom id when view is mounted', () => {
    expect(
      getTiptapEditorDomId({
        isDestroyed: false,
        view: { docView: {}, dom: { id: 'edit-note-content' } },
      }),
    ).toBe('edit-note-content');
  });
});
