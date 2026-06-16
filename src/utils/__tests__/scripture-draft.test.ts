import { describe, it, expect } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import {
  draftTextToReference,
  confirmScriptureDraftView,
  computeScriptureDraftGrowth,
  makeScriptureDraftGrowPlugin,
} from '@/components/react/TiptapScriptureDraft';
import { collectScripturePillRanges } from '@/utils/scripture-pill-spacing';

describe('draftTextToReference', () => {
  it('normalizes a complete reference', () => {
    expect(draftTextToReference('Exodus 5:1-2')).toBe('Exodus 5:1-2');
  });

  it('trims surrounding/trailing whitespace', () => {
    expect(draftTextToReference('  Exodus 5:1-2 ')).toBe('Exodus 5:1-2');
    expect(draftTextToReference('Exodus 5 ')).toBe('Exodus 5');
  });

  it('canonicalizes a clean verse range', () => {
    expect(draftTextToReference('Exodus 4:18-20')).toBe('Exodus 4:18-20');
  });

  it('keeps a chapter-only reference chapter-only (no auto-expand)', () => {
    expect(draftTextToReference('Exodus 5')).toBe('Exodus 5');
  });

  it('returns null for a book name only (not yet a reference)', () => {
    expect(draftTextToReference('Exodus')).toBeNull();
  });

  it('returns null for non-references / empty input', () => {
    expect(draftTextToReference('')).toBeNull();
    expect(draftTextToReference('   ')).toBeNull();
    expect(draftTextToReference('hello world')).toBeNull();
  });
});

// ── confirmScriptureDraftView (commit absorbs a trailing range tail) ─────────────

const draftSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
  marks: {
    scriptureDraft: { inclusive: true, parseDOM: [], toDOM: () => ['span', 0] },
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

/** Build a fake EditorView over a paragraph: [draftText](draft mark) + trailingText (plain). */
function draftView(draftText: string, trailingText = '') {
  const draftMark = draftSchema.marks.scriptureDraft.create();
  const inline = [draftSchema.text(draftText, [draftMark])];
  if (trailingText) inline.push(draftSchema.text(trailingText));
  const doc = draftSchema.node('doc', null, [draftSchema.node('paragraph', null, inline)]);
  let state = EditorState.create({ doc });
  // Caret after the trailing text (where it lands on iOS when the mark was dropped).
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, state.doc.content.size - 1)));
  const view = {
    get state() {
      return state;
    },
    dispatch(tr: any) {
      state = state.apply(tr);
    },
    dom: { dispatchEvent: () => true },
    focus: () => {},
  };
  return { view, draftEnd: 1 + draftText.length, getState: () => state };
}

function pillText(state: any): string | null {
  let found: string | null = null;
  state.doc.descendants((node: any) => {
    if (node.isText && node.marks?.some((m: any) => m.type.name === 'scripturePill')) {
      found = node.text;
      return false;
    }
    return undefined;
  });
  return found;
}

describe('confirmScriptureDraftView', () => {
  it('absorbs a trailing range tail left as plain text after the draft', () => {
    // iOS dropped the inclusive draft mark, so "-3" sits just past the "Psalm 27:1" draft.
    const { view, draftEnd, getState } = draftView('Psalm 27:1', '-3');
    const ref = confirmScriptureDraftView(view, draftEnd);
    expect(ref).toBe('Psalm 27:1-3');
    expect(pillText(getState())).toBe('Psalm 27:1-3');
  });

  it('commits a plain chapter:verse draft unchanged', () => {
    const { view, draftEnd, getState } = draftView('Psalm 27:1');
    const ref = confirmScriptureDraftView(view, draftEnd);
    expect(ref).toBe('Psalm 27:1');
    expect(pillText(getState())).toBe('Psalm 27:1');
  });

  it('does not absorb following prose (space stops the scan)', () => {
    const { view, draftEnd, getState } = draftView('Psalm 27:1', ' and');
    const ref = confirmScriptureDraftView(view, draftEnd);
    expect(ref).toBe('Psalm 27:1');
    expect(pillText(getState())).toBe('Psalm 27:1');
  });
});

describe('computeScriptureDraftGrowth', () => {
  it('grows the draft over a trailing range tail typed as plain text', () => {
    // "Exodus 5:1"[draft] + "-2"[plain] — the plugin should mark them as one pill.
    const { view } = draftView('Exodus 5:1', '-2');
    const growth = computeScriptureDraftGrowth(view.state.doc, view.state.selection.from);
    expect(growth).not.toBeNull();
    expect(growth!.from).toBe(1);
    expect(view.state.doc.textBetween(growth!.from, growth!.to)).toBe('Exodus 5:1-2');
  });

  it('returns null when the draft already covers the full reference', () => {
    const { view } = draftView('Exodus 5:1');
    expect(computeScriptureDraftGrowth(view.state.doc, view.state.selection.from)).toBeNull();
  });

  it('stops at non-continuation text (does not swallow following prose)', () => {
    const { view } = draftView('Exodus 5:1', ' and more');
    expect(computeScriptureDraftGrowth(view.state.doc, view.state.selection.from)).toBeNull();
  });
});

describe('makeScriptureDraftGrowPlugin (end-to-end)', () => {
  it('grows the draft mark over a plain range tail inserted after it, as one pill', () => {
    const draftMark = draftSchema.marks.scriptureDraft.create();
    const doc = draftSchema.node('doc', null, [
      draftSchema.node('paragraph', null, [draftSchema.text('Exodus 5:1', [draftMark])]),
    ]);
    let state = EditorState.create({ doc, plugins: [makeScriptureDraftGrowPlugin()] });
    const draftEnd = 1 + 'Exodus 5:1'.length; // position right after the draft
    // Insert "-2" as a plain (unmarked) text node — simulates iOS dropping the mark on input.
    state = state.apply(state.tr.insert(draftEnd, draftSchema.text('-2')));
    // The plugin's appendTransaction should have extended the mark to cover the whole range.
    const ranges = collectScripturePillRanges(state.doc, 'scriptureDraft');
    expect(ranges).toHaveLength(1);
    expect(state.doc.textBetween(ranges[0].start, ranges[0].end)).toBe('Exodus 5:1-2');
  });
});
