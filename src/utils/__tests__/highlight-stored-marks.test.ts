import { describe, it, expect } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { makeHighlightStoredMarksPlugin } from '@/components/react/TiptapHighlightCustom';

// Minimal schema: a non-inclusive `highlight` mark (mirrors HighlightCustom) + the plugin.
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
  marks: {
    highlight: { attrs: { color: { default: null } }, inclusive: false, toDOM: () => ['mark', 0] },
  },
});

/** Build a doc with `text`, highlight [1,10) ("Testament"), the stored-marks plugin installed. */
function highlightedState() {
  const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Testament test')])]);
  let state = EditorState.create({ doc, plugins: [makeHighlightStoredMarksPlugin()] });
  const hl = schema.marks.highlight.create({ color: 'warmAmber' });
  state = state.apply(state.tr.addMark(1, 10, hl));
  return { state, hl };
}

describe('makeHighlightStoredMarksPlugin', () => {
  it('strips highlight from stored marks when the caret is outside a highlight', () => {
    const { state, hl } = highlightedState();
    // Caret at the highlight's right edge with highlight still in stored marks (as setHighlight leaves it).
    const next = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 10)).setStoredMarks([hl]));
    expect((next.storedMarks || []).some((m) => m.type.name === 'highlight')).toBe(false);
  });

  it('keeps highlight in stored marks when the caret is inside a highlight', () => {
    const { state, hl } = highlightedState();
    const next = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 5)).setStoredMarks([hl]));
    expect((next.storedMarks || []).some((m) => m.type.name === 'highlight')).toBe(true);
  });

  it('does nothing when there are no stored marks', () => {
    const { state } = highlightedState();
    const next = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 12)));
    expect(next.storedMarks).toBeNull();
  });
});
