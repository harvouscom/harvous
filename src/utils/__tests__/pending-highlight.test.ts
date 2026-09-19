/**
 * The pieces that let a highlight show before the server confirms it.
 *
 * Real editor, real marks: finding a mark by its id after the document has moved is the part
 * that has to be right, and a fake document would only test the fake.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { HighlightCustom } from '@/components/react/TiptapHighlightCustom';
import {
  adoptHighlightEntryId,
  highlightRangesWithId,
  newClientStudyThreadEntryId,
} from '../pending-highlight';
import { collectOrphanHighlightMarks } from '../orphan-highlight-backfill';
import { emptyStudyDockStack, openOrFocusHighlight } from '../study-dock-stack';

let editor: Editor;
afterEach(() => editor?.destroy());

/** "Grace and peace to you" with "peace" highlighted under `id`. */
function editorWithHighlight(id: string) {
  editor = new Editor({
    extensions: [StarterKit, HighlightCustom.configure({ multicolor: true })],
    content: '<p>Grace and peace to you</p>',
  });
  editor.chain().setTextSelection({ from: 11, to: 16 }).setHighlight({ color: 'warmAmber', studyThreadEntryId: id }).run();
}

describe('newClientStudyThreadEntryId', () => {
  it('matches what the create route accepts', () => {
    // Keep in step with CLIENT_STUDY_THREAD_ID in server/routes/study-threads.ts.
    expect(newClientStudyThreadEntryId()).toMatch(/^study_\d{13,19}$/);
    expect(newClientStudyThreadEntryId(1789757444697, () => 0.000042)).toBe('study_1789757444697000042');
  });

  it('differs between two clients in the same millisecond', () => {
    expect(newClientStudyThreadEntryId(1, () => 0.1)).not.toBe(newClientStudyThreadEntryId(1, () => 0.2));
  });
});

describe('highlightRangesWithId', () => {
  it('finds the mark by its id wherever the text has moved it', () => {
    editorWithHighlight('study_1');
    editor.chain().insertContentAt(1, 'Amazing ').run();
    const [range] = highlightRangesWithId(editor.state.doc, 'study_1');
    expect(editor.state.doc.textBetween(range.from, range.to)).toBe('peace');
    expect(range.attrs).toMatchObject({ color: 'warmAmber', studyThreadEntryId: 'study_1' });
  });

  it('finds nothing once the highlight is removed', () => {
    editorWithHighlight('study_1');
    const [range] = highlightRangesWithId(editor.state.doc, 'study_1');
    editor.chain().setTextSelection(range).unsetHighlight().run();
    expect(highlightRangesWithId(editor.state.doc, 'study_1')).toEqual([]);
  });

  it('keeps one range when a mark spans text split by other marks', () => {
    editor = new Editor({
      extensions: [StarterKit, HighlightCustom.configure({ multicolor: true })],
      content: '<p>Grace and <strong>pe</strong>ace to you</p>',
    });
    editor.chain().setTextSelection({ from: 11, to: 16 }).setHighlight({ color: 'warmAmber', studyThreadEntryId: 'study_2' }).run();
    const ranges = highlightRangesWithId(editor.state.doc, 'study_2');
    expect(ranges).toHaveLength(1);
    expect(editor.state.doc.textBetween(ranges[0].from, ranges[0].to)).toBe('peace');
  });
});

describe('a mark painted with its id is never an orphan', () => {
  it('is invisible to the open-time backfill, so it cannot get a second row', () => {
    // The failure the proposed id exists to prevent: an id-less optimistic mark was
    // indistinguishable from an orphan, and the backfill made it a second row.
    editorWithHighlight(newClientStudyThreadEntryId());
    expect(collectOrphanHighlightMarks(editor as never)).toEqual([]);
  });
});

describe('adoptHighlightEntryId', () => {
  const range = { from: 11, to: 16 };
  const openPending = () =>
    openOrFocusHighlight(emptyStudyDockStack(), {
      studyThreadEntryId: null,
      accent: 'warmAmber',
      excerpt: 'peace',
      range,
      entryKind: 'miniNote',
      focusTitle: 'peace',
      miniNoteBody: '',
    } as never);

  it('re-keys the card opened before the row existed, rather than opening a second', () => {
    const stack = adoptHighlightEntryId(openPending(), range, 'study_9');
    expect(stack.entries).toHaveLength(1);
    const entry = stack.entries[0];
    expect(entry.stableKey).toBe('highlight:study_9');
    expect(entry.kind === 'highlight' && entry.session.studyThreadEntryId).toBe('study_9');
    const again = openOrFocusHighlight(stack, { ...(entry.session as object), studyThreadEntryId: 'study_9' } as never);
    expect(again.entries).toHaveLength(1);
  });

  it('leaves the stack alone when that card was already closed', () => {
    const empty = emptyStudyDockStack();
    expect(adoptHighlightEntryId(empty, range, 'study_9')).toBe(empty);
  });
});
