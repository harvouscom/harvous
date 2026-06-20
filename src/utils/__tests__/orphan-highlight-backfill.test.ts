import { describe, it, expect } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { collectOrphanHighlightMarks } from '@/utils/orphan-highlight-backfill';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
  marks: {
    highlight: {
      attrs: {
        color: { default: null },
        studyThreadEntryId: { default: null },
        reference: { default: null },
        linkedNoteId: { default: null },
      },
      inclusive: false,
      toDOM: () => ['mark', 0],
    },
  },
});

function editorFromText(
  text: string,
  marks: Array<{ start: number; end: number; attrs: Record<string, string | null> }>,
) {
  const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text(text)])]);
  let state = EditorState.create({ doc });
  const hl = schema.marks.highlight;
  for (const m of marks) {
    const mark = hl.create(m.attrs);
    state = state.apply(state.tr.addMark(1 + m.start, 1 + m.end, mark));
  }
  return {
    state,
    schema: { marks: { highlight: schema.marks.highlight } },
  };
}

describe('collectOrphanHighlightMarks', () => {
  it('collects highlight marks without studyThreadEntryId', () => {
    const editor = editorFromText('years and know', [
      { start: 0, end: 5, attrs: { color: 'warmAmber', studyThreadEntryId: null, reference: null, linkedNoteId: null } },
      { start: 10, end: 14, attrs: { color: 'warmAmber', studyThreadEntryId: 'thread_1', reference: null, linkedNoteId: null } },
    ]);
    const orphans = collectOrphanHighlightMarks(editor as never);
    expect(orphans).toHaveLength(1);
    expect(orphans[0]?.snippet).toBe('years');
  });

  it('collects reference orphans with entryKind reference', () => {
    const editor = editorFromText('kids walk', [
      { start: 0, end: 4, attrs: { color: 'warmAmber', studyThreadEntryId: null, reference: 'kids', linkedNoteId: null } },
    ]);
    const orphans = collectOrphanHighlightMarks(editor as never);
    expect(orphans).toHaveLength(1);
    expect(orphans[0]?.entryKind).toBe('reference');
    expect(orphans[0]?.referenceWord).toBe('kids');
    expect(orphans[0]?.snippet).toBe('kids');
  });

  it('collects legacy referenceHighlight color orphans using snippet as reference word', () => {
    const editor = editorFromText('years ago', [
      {
        start: 0,
        end: 5,
        attrs: { color: 'referenceHighlight', studyThreadEntryId: null, reference: null, linkedNoteId: null },
      },
    ]);
    const orphans = collectOrphanHighlightMarks(editor as never);
    expect(orphans).toHaveLength(1);
    expect(orphans[0]?.entryKind).toBe('reference');
    expect(orphans[0]?.referenceWord).toBe('years');
  });

  it('dedupes contiguous range once', () => {
    const editor = editorFromText('know', [
      { start: 0, end: 4, attrs: { color: 'skyBlue', studyThreadEntryId: null, reference: null, linkedNoteId: null } },
    ]);
    const orphans = collectOrphanHighlightMarks(editor as never);
    expect(orphans).toHaveLength(1);
    expect(orphans[0]?.accent).toBe('skyBlue');
  });

  it('includes linkedNote orphans with linkedNoteId', () => {
    const editor = editorFromText('linked', [
      {
        start: 0,
        end: 6,
        attrs: { color: 'violet', studyThreadEntryId: null, reference: null, linkedNoteId: 'note_abc' },
      },
    ]);
    const orphans = collectOrphanHighlightMarks(editor as never);
    expect(orphans[0]?.entryKind).toBe('linkedNote');
    expect(orphans[0]?.linkedNoteId).toBe('note_abc');
  });
});
