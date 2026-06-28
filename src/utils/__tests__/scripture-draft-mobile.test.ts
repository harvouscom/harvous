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
  confirmScriptureDraftView,
  computeScriptureDraftGrowth,
  enterScriptureDraftView,
  findDetachedScriptureDraft,
  getScriptureDraftAnchorPos,
  getScriptureDraftRange,
  makeScriptureDraftDecorationPlugin,
  scriptureDraftDecorationKey,
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
  },
});

const decorationPlugin = makeScriptureDraftDecorationPlugin();

function mobileView(paragraphContent: any[], caretAtEnd = true) {
  const doc = draftSchema.node('doc', null, [draftSchema.node('paragraph', null, paragraphContent)]);
  let state = EditorState.create({ doc, plugins: [decorationPlugin] });
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

describe('mobile decoration draft', () => {
  it('enterScriptureDraftView sets decoration state without a draft mark', () => {
    const text = 'John 3:16';
    const from = 1;
    const to = from + text.length;
    const { view, getState } = mobileView([draftSchema.text(text)]);
    expect(enterScriptureDraftView(view, from, to)).toBe(true);
    expect(collectScripturePillRanges(getState().doc, 'scriptureDraft')).toHaveLength(0);
    expect(scriptureDraftDecorationKey.getState(getState())).toEqual({
      from,
      to,
      attrs: {},
    });
    expect(getScriptureDraftRange(getState())).toEqual({ from, to });
  });

  it('unifyScriptureDraftAtCursor extends decoration over a plain range tail', () => {
    const text = 'John 3:16';
    const from = 1;
    const to = from + text.length;
    const { view, getState } = mobileView([draftSchema.text(text + '-17')]);
    enterScriptureDraftView(view, from, to);
    expect(unifyScriptureDraftAtCursor(view)).toBe(true);
    const deco = scriptureDraftDecorationKey.getState(getState());
    expect(deco?.from).toBe(from);
    expect(deco?.to).toBe(from + 'John 3:16-17'.length);
    expect(collectScripturePillRanges(getState().doc, 'scriptureDraft')).toHaveLength(0);
  });

  it('getScriptureDraftAnchorPos includes trailing continuation chars', () => {
    const text = 'John 3:16';
    const from = 1;
    const to = from + text.length;
    const { view, getState } = mobileView([draftSchema.text(text + '-18')]);
    enterScriptureDraftView(view, from, to);
    expect(getScriptureDraftAnchorPos(getState())).toBe(from + 'John 3:16-18'.length);
  });

  it('confirmScriptureDraftView commits a pill and clears decoration state', () => {
    const text = 'John 3:16-18';
    const from = 1;
    const to = from + text.length;
    const { view, getState } = mobileView([draftSchema.text(text)]);
    enterScriptureDraftView(view, from, to);
    const ref = confirmScriptureDraftView(view, to, { focus: true });
    expect(ref).toBe('John 3:16-18');
    expect(scriptureDraftDecorationKey.getState(getState())).toBeNull();
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

  it('computeScriptureDraftGrowth uses decoration state on mobile', () => {
    const text = 'John 3:16';
    const from = 1;
    const to = from + text.length;
    const { view, getState } = mobileView([draftSchema.text(text + '-17')]);
    enterScriptureDraftView(view, from, to);
    const growth = computeScriptureDraftGrowth(getState().doc, getState().selection.from, getState());
    expect(growth).toEqual({ from, to: from + 'John 3:16-17'.length });
  });

  it('keeps decoration end non-inclusive when a range dash is typed (until unify)', () => {
    const text = 'John 3:16';
    const from = 1;
    const to = from + text.length;
    const { view, getState } = mobileView([draftSchema.text(text)]);
    enterScriptureDraftView(view, from, to);
    const insertAt = to;
    view.dispatch(getState().tr.insertText('-', insertAt));
    const deco = scriptureDraftDecorationKey.getState(getState());
    expect(deco?.to).toBe(to);
    expect(getState().doc.textBetween(from, from + text.length + 1)).toBe('John 3:16-');
    expect(unifyScriptureDraftAtCursor(view)).toBe(true);
    expect(scriptureDraftDecorationKey.getState(getState())?.to).toBe(from + 'John 3:16-'.length);
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
});
