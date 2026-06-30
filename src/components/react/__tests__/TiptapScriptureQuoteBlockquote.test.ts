import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { ScripturePill } from '@/components/react/TiptapScripturePill';
import { ScriptureQuoteBlockquote } from '@/components/react/TiptapScriptureQuoteBlockquote';
import { ParagraphCustom } from '@/components/react/TiptapParagraphCustom';
import { insertScriptureQuoteAt } from '@/utils/insert-scripture-quote';

function createQuoteEditor(initialHtml: string) {
  return new Editor({
    extensions: [
      StarterKit.configure({
        heading: false,
        paragraph: false,
        bold: false,
        link: false,
        blockquote: false,
      }),
      ParagraphCustom,
      ScriptureQuoteBlockquote,
      ScripturePill,
    ],
    content: initialHtml,
  });
}

describe('ScriptureQuoteBlockquote deletion', () => {
  it('removes empty scripture quote blockquote after text is deleted', () => {
    const editor = createQuoteEditor('<p>Intro</p>');
    try {
      insertScriptureQuoteAt(editor, {
        excerpt: 'For God so loved the world',
        reference: 'John 3:16',
        translation: 'NET',
        sourceNoteId: 'note_1',
        sourcePillBoundaries: null,
        lastEditorSelection: null,
      });

      expect(editor.getHTML()).toContain('data-scripture-quote-accent');

      let blockquotePos: { from: number; to: number } | null = null;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'blockquote' && node.attrs.scriptureQuoteAccent) {
          blockquotePos = { from: pos + 1, to: pos + node.nodeSize - 1 };
        }
      });
      expect(blockquotePos).not.toBeNull();

      editor.chain().focus().deleteRange(blockquotePos!).run();

      expect(editor.getHTML()).not.toContain('data-scripture-quote-accent');
      expect(editor.getHTML()).not.toContain('<blockquote');
    } finally {
      editor.destroy();
    }
  });
});
