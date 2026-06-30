import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { ScripturePill } from '@/components/react/TiptapScripturePill';
import { ScriptureQuoteBlockquote } from '@/components/react/TiptapScriptureQuoteBlockquote';
import { ParagraphCustom } from '@/components/react/TiptapParagraphCustom';
import { insertScriptureQuoteAt } from '@/utils/insert-scripture-quote';

describe('insertScriptureQuoteAt with StarterKit', () => {
  it('inserts blockquote after pill in a paragraph', () => {
    const editor = new Editor({
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
      content:
        '<p>Before <span data-scripture-reference="John 3:16" data-note-id="note_1" data-scripture-translation="NET" class="scripture-pill">John 3:16</span> after</p>',
    });
    try {
      let pillFrom = 0;
      let pillTo = 0;
      editor.state.doc.descendants((node, pos) => {
        const mark = node.marks.find((m) => m.type.name === 'scripturePill');
        if (mark) {
          pillFrom = pos;
          pillTo = pos + node.nodeSize;
        }
      });

      const ok = insertScriptureQuoteAt(editor, {
        excerpt: 'For God so loved the world',
        reference: 'John 3:16',
        translation: 'NET',
        sourceNoteId: 'note_1',
        sourcePillBoundaries: { from: pillFrom, to: pillTo },
        sourcePillReference: 'John 3:16',
        sourcePillTranslation: 'NET',
        lastEditorSelection: null,
      });

      expect(ok, editor.getHTML()).not.toBeNull();
      expect(editor.getHTML()).toContain('data-scripture-quote-accent="neutral"');
    } finally {
      editor.destroy();
    }
  });
});
