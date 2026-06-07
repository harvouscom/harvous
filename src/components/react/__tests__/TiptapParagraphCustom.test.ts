import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Text from '@tiptap/extension-text';
import HardBreak from '@tiptap/extension-hard-break';
import { ParagraphCustom } from '../TiptapParagraphCustom';
import { canonicalizeNoteHtmlLineBreaks } from '@/utils/note-html-linebreaks';

describe('ParagraphCustom', () => {
  it('does not register a live appendTransaction plugin', () => {
    expect(ParagraphCustom.config.addProseMirrorPlugins).toBeUndefined();
  });

  it('serializes empty paragraphs as br placeholders without live hardBreak nodes', () => {
    const editor = new Editor({
      extensions: [Document, ParagraphCustom, Text, HardBreak],
      content: '<p>one</p><p></p><p>two</p>',
    });

    try {
      const html = editor.getHTML();
      expect(html).toContain('<p><br></p>');
      expect(canonicalizeNoteHtmlLineBreaks(html)).toBe(
        '<p>one</p><p><br></p><p>two</p>',
      );

      const { doc } = editor.state;
      let emptyParagraphCount = 0;
      doc.descendants((node) => {
        if (node.type.name === 'paragraph' && node.childCount === 0) {
          emptyParagraphCount += 1;
        }
      });
      expect(emptyParagraphCount).toBe(1);
    } finally {
      editor.destroy();
    }
  });

  it('allows joinBackward at paragraph start without re-inserting a hardBreak', () => {
    const editor = new Editor({
      extensions: [Document, ParagraphCustom, Text, HardBreak],
      content: '<p>Line one</p><p></p><p>Line two</p>',
    });

    try {
      // Caret at start of "Line two" (third paragraph).
      editor.commands.setTextSelection(13);
      editor.commands.joinBackward();

      expect(editor.getHTML()).toBe('<p>Line one</p><p>Line two</p>');
      expect(editor.getHTML()).not.toContain('<p><br></p>');
    } finally {
      editor.destroy();
    }
  });
});
