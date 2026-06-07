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

  it('keeps empty paragraphs editable (no toDOM override) and lets save-time canonicalize add the br', () => {
    const editor = new Editor({
      extensions: [Document, ParagraphCustom, Text, HardBreak],
      content: '<p>one</p><p></p><p>two</p>',
    });

    try {
      // Live getHTML emits a plain empty <p></p> — the node MUST keep its content hole
      // so the live editor renders it editable (a forced <p><br></p> here would make the
      // node contenteditable="false" and break typing into new/empty notes).
      const html = editor.getHTML();
      expect(html).toContain('<p></p>');
      // Blank-line persistence is applied at save time, not in the live toDOM.
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

  it('round-trips multiple blank lines through getHTML and re-parse', () => {
    const initial = '<p>one</p><p></p><p></p><p>two</p>';
    const editor1 = new Editor({
      extensions: [Document, ParagraphCustom, Text, HardBreak],
      content: initial,
    });

    try {
      const serialized = canonicalizeNoteHtmlLineBreaks(editor1.getHTML());
      expect(serialized).toBe('<p>one</p><p><br></p><p><br></p><p>two</p>');

      const editor2 = new Editor({
        extensions: [Document, ParagraphCustom, Text, HardBreak],
        content: serialized,
      });
      try {
        expect(canonicalizeNoteHtmlLineBreaks(editor2.getHTML())).toBe(serialized);
      } finally {
        editor2.destroy();
      }
    } finally {
      editor1.destroy();
    }
  });
});
