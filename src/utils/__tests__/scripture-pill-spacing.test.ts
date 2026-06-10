import { describe, it, expect } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { collectScripturePillRanges, ensureScripturePillSpacing, rangeCrossesHardBreak } from '../scripture-pill-spacing';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
    hardBreak: { inline: true, group: 'inline', toDOM: () => ['br'] },
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

  it('does not insert leading space after a newline', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.text('\n'),
        schema.text('Exodus 1:1-22', [
          schema.marks.scripturePill.create({ reference: 'Exodus 1:1-22', noteId: 'pending', translation: null }),
        ]),
      ]),
    ]);
    const state = EditorState.create({ doc });
    const tr = state.tr;
    ensureScripturePillSpacing(tr);
    expect(tr.doc.textContent).toBe('\nExodus 1:1-22');
  });

  it('does not insert trailing space before a hard break', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.text('Exodus 1:1-22', [
          schema.marks.scripturePill.create({ reference: 'Exodus 1:1-22', noteId: 'pending', translation: null }),
        ]),
        schema.node('hardBreak'),
        schema.text('more'),
      ]),
    ]);
    const state = EditorState.create({ doc });
    const tr = state.tr;
    ensureScripturePillSpacing(tr);
    expect(tr.doc.textContent).toBe('Exodus 1:1-22more');
  });

  it('skips spacer insert when blank paragraph blocks exist before and after pill-only line', () => {
    const pillMark = schema.marks.scripturePill.create({
      reference: 'Exodus 1:1-22',
      noteId: 'pending',
      translation: null,
    });
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('intro')]),
      schema.node('paragraph', null, []),
      schema.node('paragraph', null, [schema.text('Exodus 1:1-22', [pillMark])]),
      schema.node('paragraph', null, []),
      schema.node('paragraph', null, [schema.text('outro')]),
    ]);
    const state = EditorState.create({ doc });
    const tr = state.tr;
    expect(ensureScripturePillSpacing(tr)).toBe(false);
    expect(tr.doc.childCount).toBe(5);
    expect(tr.doc.child(2).textContent).toBe('Exodus 1:1-22');
  });

  it('hydrate mode does not insert spacers', () => {
    const state = stateFromText([
      { text: 't', pill: false },
      { text: 'John 3:16', pill: true },
      { text: 'W', pill: false },
    ]);
    const tr = state.tr;
    expect(ensureScripturePillSpacing(tr, 'scripturePill', 'hydrate')).toBe(false);
    expect(tr.doc.textContent).toBe('tJohn 3:16W');
  });

  it('rangeCrossesHardBreak detects hard breaks inside the range', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.text('intro'),
        schema.node('hardBreak'),
        schema.text('Exodus 1:1-22'),
      ]),
    ]);
    let hardBreakPos = -1;
    let exodusFrom = -1;
    let exodusTo = -1;
    doc.descendants((node, pos) => {
      if (node.type.name === 'hardBreak') hardBreakPos = pos;
      if (node.isText && node.text === 'Exodus 1:1-22') {
        exodusFrom = pos;
        exodusTo = pos + node.nodeSize;
      }
    });
    expect(hardBreakPos).toBeGreaterThan(0);
    expect(rangeCrossesHardBreak(doc, exodusFrom - 1, exodusTo)).toBe(true);
    expect(rangeCrossesHardBreak(doc, exodusFrom, exodusTo)).toBe(false);
  });
});
