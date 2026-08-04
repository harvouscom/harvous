import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { consumeTrailingTranslationAfterPills } from '../TiptapEditor';
import { ScripturePill } from '../TiptapScripturePill';

/**
 * These tests previously imported `tryConsumeLiveTrailingTranslationAfterPill`, a symbol
 * that has never existed anywhere in this repo's history — so the file threw on import and
 * neither test had ever run, while appearing to cover the feature.
 *
 * They were written against an imagined *typing-time* ("live") API. The function that
 * actually exists, `consumeTrailingTranslationAfterPills`, is documented as **load-time
 * cleanup**: it sweeps every pill in the document rather than a selection, and deliberately
 * refuses to overwrite a pill that already carries an explicit translation. These now pin
 * that real contract.
 */

const extensions = [Document, Paragraph, Text, ScripturePill];

function pillTranslation(editor: Editor): string | null {
  let translation: string | null = null;
  editor.state.doc.descendants((node) => {
    const mark = node.marks.find((m) => m.type.name === 'scripturePill');
    if (mark) translation = (mark.attrs.translation as string | null) ?? null;
  });
  return translation;
}

function editorWithPill(translationAttr: string | null): Editor {
  const attr = translationAttr ? ` data-scripture-translation="${translationAttr}"` : '';
  return new Editor({
    extensions,
    content:
      `<p><span data-scripture-reference="Exodus 11:1-10"${attr} data-note-id="pending">Exodus 11:1-10</span> NIV</p>`,
  });
}

describe('consumeTrailingTranslationAfterPills', () => {
  it('adopts a trailing abbreviation when the pill has no translation yet', () => {
    const editor = editorWithPill(null);
    try {
      expect(consumeTrailingTranslationAfterPills(editor)).toBe(true);
      expect(pillTranslation(editor)).toBe('NIV');
      expect(editor.state.doc.textContent).toBe('Exodus 11:1-10');
    } finally {
      editor.destroy();
    }
  });

  it('adopts over NET, which is the fallback rather than a real choice', () => {
    const editor = editorWithPill('NET');
    try {
      expect(consumeTrailingTranslationAfterPills(editor)).toBe(true);
      expect(pillTranslation(editor)).toBe('NIV');
    } finally {
      editor.destroy();
    }
  });

  it('preserves an explicit per-pill translation rather than letting trailing text win', () => {
    // Deliberate: an explicit non-NET translation is a user/per-pill override.
    const editor = editorWithPill('NLT');
    try {
      consumeTrailingTranslationAfterPills(editor);
      expect(pillTranslation(editor)).toBe('NLT');
    } finally {
      editor.destroy();
    }
  });

  it('consumes the trailing text even when it does not adopt it', () => {
    // Documents current behaviour, which is arguably a wart: type "NIV" after a pill that
    // already says NLT and the text is deleted while the pill is unchanged, so the
    // keystrokes just vanish. Changing that is a product decision, not a typing fix.
    const editor = editorWithPill('NLT');
    try {
      consumeTrailingTranslationAfterPills(editor);
      expect(editor.state.doc.textContent).toBe('Exodus 11:1-10');
    } finally {
      editor.destroy();
    }
  });

  it('consumes an abbreviation left in the buffer when the pill is built around text', () => {
    const editor = new Editor({ extensions, content: '<p></p>' });
    try {
      editor.commands.insertContent('Exodus 11:1-10 NIV');
      const markType = editor.state.schema.marks.scripturePill;
      editor.commands.command(({ tr, dispatch }) => {
        if (!dispatch || !markType) return false;
        const from = 1;
        const to = 1 + 'Exodus 11:1-10'.length;
        tr.addMark(from, to, markType.create({ reference: 'Exodus 11:1-10', noteId: 'pending', translation: null }));
        dispatch(tr);
        return true;
      });
      expect(consumeTrailingTranslationAfterPills(editor)).toBe(true);
      expect(pillTranslation(editor)).toBe('NIV');
    } finally {
      editor.destroy();
    }
  });

  it('is a no-op on a document with no pills', () => {
    const editor = new Editor({ extensions, content: '<p>Exodus 11:1-10 NIV</p>' });
    try {
      expect(consumeTrailingTranslationAfterPills(editor)).toBe(false);
      expect(editor.state.doc.textContent).toBe('Exodus 11:1-10 NIV');
    } finally {
      editor.destroy();
    }
  });
});
