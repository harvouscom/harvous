import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Text from '@tiptap/extension-text';
import HardBreak from '@tiptap/extension-hard-break';
import { ParagraphCustom } from '@/components/react/TiptapParagraphCustom';
import { canonicalizeNoteHtmlLineBreaks } from '../note-html-linebreaks';
import {
  noteClipboardPlainTextFromFragment,
  noteClipboardPlainTextFromRange,
} from '../note-clipboard-plain-text';

const extensions = [Document, ParagraphCustom, Text, HardBreak];

describe('noteClipboardPlainText', () => {
  it('joins paragraphs with a single newline (native parity)', () => {
    const editor = new Editor({ extensions, content: '<p>a</p><p>b</p>' });
    try {
      const slice = editor.state.doc.slice(0, editor.state.doc.content.size);
      expect(noteClipboardPlainTextFromFragment(slice.content)).toBe('a\nb');
      expect(noteClipboardPlainTextFromRange(editor.state.doc, 0, editor.state.doc.content.size)).toBe(
        'a\nb',
      );
    } finally {
      editor.destroy();
    }
  });

  it('preserves hard breaks inside a paragraph', () => {
    const editor = new Editor({ extensions, content: '<p>a<br>b</p>' });
    try {
      const slice = editor.state.doc.slice(0, editor.state.doc.content.size);
      expect(noteClipboardPlainTextFromFragment(slice.content)).toBe('a\nb');
    } finally {
      editor.destroy();
    }
  });

  it('preserves blank-line paragraphs from canonicalized HTML', () => {
    const html = canonicalizeNoteHtmlLineBreaks('<p>a</p><p></p><p>b</p>');
    const editor = new Editor({ extensions, content: html });
    try {
      const plain = noteClipboardPlainTextFromFragment(
        editor.state.doc.slice(0, editor.state.doc.content.size).content,
      );
      expect(plain).toContain('a');
      expect(plain).toContain('b');
      expect(plain.split('\n').length).toBeGreaterThanOrEqual(3);
    } finally {
      editor.destroy();
    }
  });
});
