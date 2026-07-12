import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { tryConsumeLiveTrailingTranslationAfterPill } from '../TiptapEditor';
import { ScripturePill } from '../TiptapScripturePill';

const extensions = [Document, Paragraph, Text, ScripturePill];

function pillTranslation(editor: Editor): string | null {
  let translation: string | null = null;
  editor.state.doc.descendants((node) => {
    const mark = node.marks.find((m) => m.type.name === 'scripturePill');
    if (mark) translation = (mark.attrs.translation as string | null) ?? null;
  });
  return translation;
}

describe('tryConsumeLiveTrailingTranslationAfterPill', () => {
  it('consumes NIV typed after a resolved pill and updates translation', () => {
    const editor = new Editor({
      extensions,
      content:
        '<p><span data-scripture-reference="Exodus 11:1-10" data-scripture-translation="NLT" data-note-id="pending">Exodus 11:1-10</span> NIV</p>',
    });
    try {
      editor.commands.setTextSelection(editor.state.doc.content.size - 1);
      const consumed = tryConsumeLiveTrailingTranslationAfterPill(editor);
      expect(consumed).toBe(true);
      expect(pillTranslation(editor)).toBe('NIV');
      expect(editor.state.doc.textContent).toBe('Exodus 11:1-10');
    } finally {
      editor.destroy();
    }
  });

  it('consumes inline translation when pill is created with trailing abbrev in buffer', () => {
    const editor = new Editor({ extensions, content: '<p></p>' });
    try {
      editor.commands.insertContent('Exodus 11:1-10 NIV');
      editor.commands.setTextSelection(editor.state.selection.from);
      const markType = editor.state.schema.marks.scripturePill;
      editor.commands.command(({ tr, dispatch }) => {
        if (!dispatch || !markType) return false;
        const from = 1;
        const to = 1 + 'Exodus 11:1-10'.length;
        tr.addMark(from, to, markType.create({ reference: 'Exodus 11:1-10', noteId: 'pending', translation: null }));
        dispatch(tr);
        return true;
      });
      editor.commands.setTextSelection(editor.state.doc.content.size - 1);
      const consumed = tryConsumeLiveTrailingTranslationAfterPill(editor);
      expect(consumed).toBe(true);
      expect(pillTranslation(editor)).toBe('NIV');
    } finally {
      editor.destroy();
    }
  });
});
