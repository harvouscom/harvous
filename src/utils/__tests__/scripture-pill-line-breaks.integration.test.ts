import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Text from '@tiptap/extension-text';
import HardBreak from '@tiptap/extension-hard-break';
import { ScripturePill } from '@/components/react/TiptapScripturePill';
import { ParagraphCustom } from '@/components/react/TiptapParagraphCustom';
import { canonicalizeNoteHtmlLineBreaks } from '../note-html-linebreaks';
import { countBlankParagraphs, hasLostBlockGaps } from '../scripture-pill-block-gaps';
import { ensureScripturePillSpacing } from '../scripture-pill-spacing';

const extensions = [Document, ParagraphCustom, Text, HardBreak, ScripturePill];

function applyPillMarkAndLiveSpacing(editor: Editor, reference: string, from: number, to: number): void {
  const markType = editor.state.schema.marks.scripturePill;
  if (!markType) return;

  const normalize = (s: string) => s.replace(/\s*[-–—]\s*/g, '-').replace(/\s*:\s*/g, ':').trim();
  let tr = editor.state.tr;
  const currentText = tr.doc.textBetween(from, to);
  if (normalize(currentText) !== normalize(reference)) {
    tr.replaceWith(
      from,
      to,
      tr.doc.schema.text(reference, [
        markType.create({ reference, noteId: 'pending', translation: null }),
      ]),
    );
  } else {
    tr.addMark(from, to, markType.create({ reference, noteId: 'pending', translation: null }));
  }
  ensureScripturePillSpacing(tr, 'scripturePill', 'live');
  editor.view.dispatch(tr);

  const spacingTr = editor.state.tr;
  if (ensureScripturePillSpacing(spacingTr, 'scripturePill', 'live')) {
    editor.view.dispatch(spacingTr);
  }
}

function findReferenceRange(editor: Editor, reference: string): { from: number; to: number } | null {
  let found: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || found) return;
    const idx = node.text?.indexOf(reference) ?? -1;
    if (idx >= 0) {
      found = { from: pos + idx, to: pos + idx + reference.length };
    }
  });
  return found;
}

describe('scripture pill line breaks (integration)', () => {
  it('preserves blank paragraphs before and after pill-only line on live apply', () => {
    const initial = canonicalizeNoteHtmlLineBreaks(
      '<p>intro</p><p></p><p>Exodus 1:1-22</p><p></p><p>outro</p>',
    );
    const editor = new Editor({ extensions, content: initial });
    try {
      const range = findReferenceRange(editor, 'Exodus 1:1-22');
      expect(range).not.toBeNull();
      applyPillMarkAndLiveSpacing(editor, 'Exodus 1:1-22', range!.from, range!.to);

      const outgoing = canonicalizeNoteHtmlLineBreaks(editor.getHTML());
      expect(hasLostBlockGaps(initial, outgoing)).toBe(false);
      expect(countBlankParagraphs(outgoing)).toBe(2);
      expect(outgoing).toContain('data-scripture-reference');
    } finally {
      editor.destroy();
    }
  });

  it('preserves hard break before pill in the same paragraph on live apply', () => {
    const editor = new Editor({
      extensions,
      content: '<p>intro<br>Exodus 1:1-22</p>',
    });
    try {
      const before = editor.getHTML();
      expect(before).toContain('<br');

      const range = findReferenceRange(editor, 'Exodus 1:1-22');
      expect(range).not.toBeNull();
      applyPillMarkAndLiveSpacing(editor, 'Exodus 1:1-22', range!.from, range!.to);

      const after = editor.getHTML();
      expect(after).toContain('<br');
      expect(after).toContain('data-scripture-reference');
    } finally {
      editor.destroy();
    }
  });

  it('preserves hard break after pill in the same paragraph on live apply', () => {
    const editor = new Editor({
      extensions,
      content: '<p>Exodus 1:1-22<br>outro</p>',
    });
    try {
      const range = findReferenceRange(editor, 'Exodus 1:1-22');
      expect(range).not.toBeNull();
      applyPillMarkAndLiveSpacing(editor, 'Exodus 1:1-22', range!.from, range!.to);

      expect(editor.getHTML()).toContain('<br');
      expect(editor.getHTML()).toContain('data-scripture-reference');
    } finally {
      editor.destroy();
    }
  });
});
