import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { ScripturePill } from '../TiptapScripturePill';
import { detectScriptureReferenceEndingAtCursor } from '@/utils/scripture-pill-position';
import { snapCursorOutsideScripturePill } from '../TiptapEditor';

const extensions = [Document, Paragraph, Text, ScripturePill];

/** Insert "<ref> " into an empty doc and wrap <ref> in a pill mark — yields a leading pill at pos 1. */
function editorWithLeadingPill(): Editor {
  const editor = new Editor({ extensions, content: '<p></p>' });
  editor.commands.insertContent('Exodus 1:1-22 ');
  const result = detectScriptureReferenceEndingAtCursor(editor.state.doc, editor.state.selection.from);
  if (!result) throw new Error('expected scripture reference to be detected');
  const markType = editor.state.schema.marks.scripturePill;
  editor.commands.command(({ tr, dispatch }) => {
    if (!dispatch) return true;
    tr.addMark(result.from, result.to, markType.create({ reference: result.reference, noteId: 'pending', translation: null }));
    dispatch(tr);
    return true;
  });
  return editor;
}

describe('caret can rest before a scripture pill', () => {
  it('does not snap a collapsed caret at the left edge of a leading pill', () => {
    const editor = editorWithLeadingPill();
    try {
      // Position 1 is the start of the paragraph content — directly before the leading pill.
      editor.commands.setTextSelection(1);
      expect(editor.state.selection.from).toBe(1);

      snapCursorOutsideScripturePill(editor);

      // The caret must stay at the front; previously it was forced to the pill's end.
      expect(editor.state.selection.from).toBe(1);
      expect(editor.state.selection.empty).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it('still snaps a caret that is genuinely inside the pill to the pill end', () => {
    const editor = editorWithLeadingPill();
    try {
      // Pill text "Exodus 1:1-22" spans positions 1..14; place the caret inside it.
      editor.commands.setTextSelection(4);
      snapCursorOutsideScripturePill(editor);
      // Snapped out to the pill's end (not left inside the atomic pill).
      expect(editor.state.selection.from).toBeGreaterThan(4);
    } finally {
      editor.destroy();
    }
  });
});
