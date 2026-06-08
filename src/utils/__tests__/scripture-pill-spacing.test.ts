import { describe, it, expect } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { collectScripturePillRanges, ensureScripturePillSpacing } from '../scripture-pill-spacing';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
  marks: {
    scripturePill: {
      attrs: { reference: {}, noteId: {}, translation: { default: null }, pillAccent: { default: null } },
      toDOM: () => ['span', 0],
    },
  },
});

function stateFromText(parts: Array<{ text: string; pill?: boolean }>) {
  const children = parts.map((p) => {
    const marks = p.pill
      ? [schema.marks.scripturePill.create({ reference: p.text, noteId: 'pending', translation: null })]
      : [];
    return schema.text(p.text, marks);
  });
  const doc = schema.node('doc', null, [schema.node('paragraph', null, children)]);
  return EditorState.create({ doc });
}

describe('collectScripturePillRanges', () => {
  it('merges contiguous pill text nodes', () => {
    const state = stateFromText([
      { text: 't', pill: false },
      { text: 'John 3:16', pill: true },
      { text: 'W', pill: false },
    ]);
    const ranges = collectScripturePillRanges(state.doc);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].end - ranges[0].start).toBe('John 3:16'.length);
  });
});

describe('ensureScripturePillSpacing', () => {
  it('inserts leading and trailing spaces when prose touches the pill', () => {
    const state = stateFromText([
      { text: 't', pill: false },
      { text: 'Exodus 4:18-31', pill: true },
      { text: 'W', pill: false },
    ]);
    const tr = state.tr;
    const modified = ensureScripturePillSpacing(tr);
    expect(modified).toBe(true);
    expect(tr.doc.textContent).toBe('t Exodus 4:18-31 W');
  });

  it('is idempotent when spaces already exist', () => {
    const state = stateFromText([
      { text: 't ', pill: false },
      { text: 'John 3:16', pill: true },
      { text: ' more', pill: false },
    ]);
    const tr = state.tr;
    expect(ensureScripturePillSpacing(tr)).toBe(false);
    expect(tr.doc.textContent).toBe('t John 3:16 more');
  });

  it('skips leading space at paragraph start', () => {
    const state = stateFromText([
      { text: 'Genesis 1:1', pill: true },
      { text: 'x', pill: false },
    ]);
    const tr = state.tr;
    ensureScripturePillSpacing(tr);
    expect(tr.doc.textContent).toBe('Genesis 1:1 x');
  });
});
