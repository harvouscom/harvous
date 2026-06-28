import { describe, it, expect, vi } from 'vitest';

vi.mock('@/utils/pwa-prompt', () => ({
  isMobileDevice: () => true,
}));

vi.mock('@/utils/profile-cache', () => ({
  getEffectiveDefaultTranslation: () => 'ESV',
}));

import { Schema } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import {
  cancelScriptureDraftView,
  canSafelyResyncMobileDraftIdleCaret,
  confirmScriptureDraftView,
  computeScriptureDraftGrowth,
  enterScriptureDraftView,
  findDetachedScriptureDraft,
  getScriptureDraftAnchorPos,
  getScriptureDraftRange,
  hasActiveScriptureDraft,
  hasDraftContinuationTailInDoc,
  unifyScriptureDraftAtCursor,
} from '@/components/react/TiptapScriptureDraft';
import { collectScripturePillRanges } from '@/utils/scripture-pill-spacing';

const draftSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
  marks: {
    scriptureDraft: {
      attrs: { translation: { default: null }, pillAccent: { default: null } },
      inclusive: false,
      parseDOM: [],
      toDOM: () => ['span', 0],
    },
    scripturePill: {
      attrs: {
        reference: { default: '' },
        noteId: { default: null },
        translation: { default: null },
        pillAccent: { default: null },
      },
      inclusive: false,
      toDOM: () => ['span', 0],
    },
    bold: {
      parseDOM: [{ tag: 'strong' }],
      toDOM: () => ['strong', 0],
    },
  },
});

function mobileView(paragraphContent: any[], caretAtEnd = true) {
  const doc = draftSchema.node('doc', null, [draftSchema.node('paragraph', null, paragraphContent)]);
  let state = EditorState.create({ doc });
  if (caretAtEnd) {
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, state.doc.content.size - 1)),
    );
  }
  const view = {
    get state() {
      return state;
    },
    dispatch(tr: any) {
      state = state.apply(tr);
    },
    dom: { dispatchEvent: () => true, querySelector: () => null },
    focus: () => {},
    domAtPos: () => ({ node: document.createTextNode(''), offset: 0 }),
  };
  return { view, getState: () => state };
}

describe('mobile mark-based draft', () => {
  it('enterScriptureDraftView applies a draft mark on mobile', () => {
    const text = 'John 3:16';
    const from = 1;
    const to = from + text.length;
    const { view, getState } = mobileView([draftSchema.text(text)]);
    expect(enterScriptureDraftView(view, from, to)).toBe(true);
    expect(collectScripturePillRanges(getState().doc, 'scriptureDraft')).toHaveLength(1);
    expect(getScriptureDraftRange(getState())).toEqual({ from, to });
  });

  it('unifyScriptureDraftAtCursor extends the draft mark over a plain range tail', () => {
    const text = 'John 3:16';
    const from = 1;
    const to = from + text.length;
    const { view, getState } = mobileView([draftSchema.text(text + '-17')]);
    enterScriptureDraftView(view, from, to);
    expect(unifyScriptureDraftAtCursor(view)).toBe(true);
    const ranges = collectScripturePillRanges(getState().doc, 'scriptureDraft');
    expect(ranges).toHaveLength(1);
    expect(ranges[0].start).toBe(from);
    expect(ranges[0].end).toBe(from + 'John 3:16-17'.length);
  });

  it('getScriptureDraftAnchorPos includes trailing continuation chars', () => {
    const text = 'John 3:16';
    const from = 1;
    const to = from + text.length;
    const { view, getState } = mobileView([draftSchema.text(text + '-18')]);
    enterScriptureDraftView(view, from, to);
    expect(getScriptureDraftAnchorPos(getState())).toBe(from + 'John 3:16-18'.length);
  });

  it('confirmScriptureDraftView commits a pill and clears the draft mark', () => {
    const text = 'John 3:16-18';
    const from = 1;
    const to = from + text.length;
    const { view, getState } = mobileView([draftSchema.text(text)]);
    enterScriptureDraftView(view, from, to);
    const ref = confirmScriptureDraftView(view, to, { focus: true });
    expect(ref).toBe('John 3:16-18');
    expect(collectScripturePillRanges(getState().doc, 'scriptureDraft')).toHaveLength(0);
    let pillText: string | null = null;
    getState().doc.descendants((node: any) => {
      if (node.isText && node.marks?.some((m: any) => m.type.name === 'scripturePill')) {
        pillText = node.text;
        return false;
      }
      return undefined;
    });
    expect(pillText).toBe('John 3:16-18');
    expect(getState().selection.from).toBeGreaterThan(from);
  });

  it('computeScriptureDraftGrowth absorbs a plain range tail', () => {
    const text = 'John 3:16';
    const from = 1;
    const to = from + text.length;
    const { view, getState } = mobileView([draftSchema.text(text + '-17')]);
    enterScriptureDraftView(view, from, to);
    const growth = computeScriptureDraftGrowth(getState().doc, getState().selection.from);
    expect(growth).toEqual({ from, to: from + 'John 3:16-17'.length });
  });

  it('keeps draft mark end fixed when a range dash is typed (until unify)', () => {
    const text = 'John 3:16';
    const from = 1;
    const to = from + text.length;
    const { view, getState } = mobileView([draftSchema.text(text)]);
    enterScriptureDraftView(view, from, to);
    view.dispatch(getState().tr.insertText('-', to));
    const ranges = collectScripturePillRanges(getState().doc, 'scriptureDraft');
    expect(ranges[0]?.end).toBe(to);
    expect(getState().doc.textBetween(from, from + text.length + 1)).toBe('John 3:16-');
    expect(unifyScriptureDraftAtCursor(view)).toBe(true);
    expect(collectScripturePillRanges(getState().doc, 'scriptureDraft')[0]?.end).toBe(
      from + 'John 3:16-'.length,
    );
  });

  it('does not treat a draft as detached while typing a range tail', () => {
    const text = 'John 3:16';
    const from = 1;
    const to = from + text.length;
    const { view, getState } = mobileView([draftSchema.text(text)]);
    enterScriptureDraftView(view, from, to);
    view.dispatch(getState().tr.insertText('-', to));
    view.dispatch(getState().tr.setSelection(TextSelection.create(getState().doc, to + 1)));
    expect(findDetachedScriptureDraft(getState())).toBeNull();
  });

  it('hasDraftContinuationTailInDoc detects range tail after draft end', () => {
    const text = 'Numbers 5:5';
    const from = 1;
    const to = from + text.length;
    const { view, getState } = mobileView([draftSchema.text(text)]);
    enterScriptureDraftView(view, from, to);
    expect(hasDraftContinuationTailInDoc(getState(), to)).toBe(false);
    expect(hasActiveScriptureDraft(getState())).toBe(true);
    view.dispatch(getState().tr.insertText('-10', to));
    expect(hasDraftContinuationTailInDoc(getState(), to)).toBe(true);
  });

  it('unifies and confirms Numbers 5:5-10 with plain range tail', () => {
    const base = 'Numbers 5:5';
    const full = 'Numbers 5:5-10';
    const from = 1;
    const to = from + base.length;
    const { view, getState } = mobileView([draftSchema.text(full)]);
    enterScriptureDraftView(view, from, to);
    expect(unifyScriptureDraftAtCursor(view)).toBe(true);
    expect(collectScripturePillRanges(getState().doc, 'scriptureDraft')[0]?.end).toBe(from + full.length);
    const ref = confirmScriptureDraftView(view, to, { focus: true });
    expect(ref).toBe('Numbers 5:5-10');
  });

  it('keeps the draft open when confirm is called on an incomplete range tail', () => {
    const base = 'Numbers 5:5';
    const from = 1;
    const to = from + base.length;
    const { view, getState } = mobileView([draftSchema.text(base + '-')]);
    enterScriptureDraftView(view, from, to);
    expect(confirmScriptureDraftView(view, to)).toBeNull();
    expect(collectScripturePillRanges(getState().doc, 'scriptureDraft')).toHaveLength(1);
    expect(getState().doc.textBetween(from, from + base.length + 1)).toBe('Numbers 5:5-');
  });

  it('enterScriptureDraftView clears storedMarks', () => {
    const text = 'John 3:16';
    const from = 1;
    const to = from + text.length;
    const { view, getState } = mobileView([draftSchema.text(text)]);
    view.dispatch(
      getState()
        .tr.setStoredMarks([draftSchema.marks.bold.create()])
        .setSelection(TextSelection.create(getState().doc, to)),
    );
    expect(enterScriptureDraftView(view, from, to)).toBe(true);
    expect(getState().storedMarks ?? []).toHaveLength(0);
  });

  it('unifyScriptureDraftAtCursor clears storedMarks', () => {
    const text = 'John 3:16';
    const from = 1;
    const to = from + text.length;
    const { view, getState } = mobileView([draftSchema.text(text + '-17')]);
    enterScriptureDraftView(view, from, to);
    view.dispatch(getState().tr.setStoredMarks([draftSchema.marks.bold.create()]));
    expect(unifyScriptureDraftAtCursor(view)).toBe(true);
    expect(getState().storedMarks ?? []).toHaveLength(0);
  });

  it('unifyScriptureDraftAtCursor keeps the caret after the range tail on mobile', () => {
    const text = 'John 3:16';
    const from = 1;
    const to = from + text.length;
    const fullLen = from + 'John 3:16-17'.length;
    const { view, getState } = mobileView([draftSchema.text(text + '-17')]);
    enterScriptureDraftView(view, from, to);
    view.dispatch(getState().tr.setSelection(TextSelection.create(getState().doc, fullLen)));
    expect(unifyScriptureDraftAtCursor(view)).toBe(true);
    expect(getState().selection.from).toBe(fullLen);
  });

  it('cancelScriptureDraftView strips bold and clears storedMarks', () => {
    const base = 'Numbers 5:5';
    const from = 1;
    const to = from + base.length;
    const bold = draftSchema.marks.bold.create();
    const { view, getState } = mobileView([draftSchema.text(base, [bold])]);
    enterScriptureDraftView(view, from, to);
    view.dispatch(getState().tr.setStoredMarks([bold]));
    expect(cancelScriptureDraftView(view)).toBe(true);
    expect(collectScripturePillRanges(getState().doc, 'scriptureDraft')).toHaveLength(0);
    expect(getState().storedMarks ?? []).toHaveLength(0);
    getState().doc.nodesBetween(from, to, (node: any) => {
      if (node.isText) {
        expect(node.marks.some((m: any) => m.type.name === 'bold')).toBe(false);
      }
    });
  });

  it('canSafelyResyncMobileDraftIdleCaret is true when caret is at anchor with no tail', () => {
    const text = 'John 3:16';
    const from = 1;
    const to = from + text.length;
    const { view, getState } = mobileView([draftSchema.text(text)]);
    enterScriptureDraftView(view, from, to);
    view.dispatch(getState().tr.setSelection(TextSelection.create(getState().doc, to)));
    expect(canSafelyResyncMobileDraftIdleCaret(getState())).toBe(true);
  });

  it('canSafelyResyncMobileDraftIdleCaret is false when a range tail exists', () => {
    const text = 'Numbers 5:5';
    const from = 1;
    const to = from + text.length;
    const { view, getState } = mobileView([draftSchema.text(text)]);
    enterScriptureDraftView(view, from, to);
    view.dispatch(getState().tr.insertText('-10', to));
    const anchor = getScriptureDraftAnchorPos(getState());
    view.dispatch(getState().tr.setSelection(TextSelection.create(getState().doc, anchor!)));
    expect(hasDraftContinuationTailInDoc(getState(), to)).toBe(true);
    expect(canSafelyResyncMobileDraftIdleCaret(getState())).toBe(false);
  });

  it('canSafelyResyncMobileDraftIdleCaret is false when caret is not at anchor', () => {
    const text = 'John 3:16';
    const from = 1;
    const to = from + text.length;
    const { view, getState } = mobileView([draftSchema.text(text)]);
    enterScriptureDraftView(view, from, to);
    view.dispatch(getState().tr.setSelection(TextSelection.create(getState().doc, from)));
    expect(canSafelyResyncMobileDraftIdleCaret(getState())).toBe(false);
  });
});
