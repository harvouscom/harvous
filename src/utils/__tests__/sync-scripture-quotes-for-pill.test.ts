import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { ScripturePill } from '@/components/react/TiptapScripturePill';
import { ScriptureQuoteBlockquote } from '@/components/react/TiptapScriptureQuoteBlockquote';
import {
  findScriptureQuotesAfterPillBlock,
  syncAdjacentScriptureQuoteAccents,
  syncAdjacentScriptureQuotesForPillApply,
} from '@/utils/sync-scripture-quotes-for-pill';

const extensions = [Document, Paragraph, Text, ScriptureQuoteBlockquote, ScripturePill];

describe('findScriptureQuotesAfterPillBlock', () => {
  it('finds a scripture quote blockquote immediately after the pill paragraph', () => {
    const editor = new Editor({
      extensions,
      content:
        '<p><span data-scripture-reference="Genesis 1:1-2" data-note-id="note_1" data-scripture-translation="NLT" class="scripture-pill">Genesis 1:1-2</span></p><blockquote data-scripture-quote-accent="warmAmber" data-scripture-quote-reference="Genesis 1:1-2" data-scripture-quote-translation="NLT"><p>Quoted passage</p></blockquote>',
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

      const quotes = findScriptureQuotesAfterPillBlock(editor.state.doc, pillFrom, pillTo);
      expect(quotes).toHaveLength(1);
      expect(quotes[0].node.textContent).toBe('Quoted passage');
    } finally {
      editor.destroy();
    }
  });
});

describe('syncAdjacentScriptureQuoteAccents', () => {
  it('updates the accent on an adjacent quote when the pill swatch changes', () => {
    const editor = new Editor({
      extensions,
      content:
        '<p><span data-scripture-reference="Genesis 1:1-2" data-note-id="note_1" data-scripture-translation="NLT" class="scripture-pill">Genesis 1:1-2</span></p><blockquote data-scripture-quote-accent="neutral" data-scripture-quote-reference="Genesis 1:1-2" data-scripture-quote-translation="NLT"><p>Quoted passage</p></blockquote>',
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

      syncAdjacentScriptureQuoteAccents(editor, pillFrom, pillTo, 'skyBlue');
      expect(editor.getHTML()).toContain('data-scripture-quote-accent="skyBlue"');
    } finally {
      editor.destroy();
    }
  });
});

/**
 * `syncAdjacentScriptureQuotesForPillApply` writes the reference it is given into
 * `data-scripture-quote-reference`. Handed a rendered pill instead of a reference string, it used
 * to store the markup verbatim — the corruption in note_1783229089806 ("The first book"), where
 * the value's own double quotes end the attribute early and spill the rest of the blockquote tag
 * into the page as text.
 */
describe('syncAdjacentScriptureQuotesForPillApply reference coercion', () => {
  const PILL_MARKUP =
    '<span data-scripture-reference="Genesis 1:1-2" data-note-id="note_1782013851464" data-scripture-translation="NLT" class="scripture-pill scripture-pill-clickable">Genesis 1:1-2</span>';

  it('stores the reference the pill labels, not the pill markup', async () => {
    const editor = new Editor({
      extensions,
      content:
        '<p><span data-scripture-reference="Genesis 1:1-2" data-note-id="note_1" data-scripture-translation="NLT" class="scripture-pill">Genesis 1:1-2</span></p>' +
        '<blockquote data-scripture-quote-accent="neutral" data-scripture-quote-reference="Genesis 1:1" data-scripture-quote-translation="NLT"><p>Quoted passage</p></blockquote>',
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

      await syncAdjacentScriptureQuotesForPillApply(
        editor,
        pillFrom,
        pillTo,
        PILL_MARKUP,
        'NLT',
        'mintGreen',
      );

      const html = editor.getHTML();
      expect(html).not.toMatch(/data-scripture-quote-reference="[^"]*<span/);
      const quote = new DOMParser().parseFromString(html, 'text/html').querySelector('blockquote');
      expect(quote?.getAttribute('data-scripture-quote-reference')).toBe('Genesis 1:1');
      expect(quote?.getAttribute('data-scripture-quote-translation')).toBe('NLT');
    } finally {
      editor.destroy();
    }
  });
});
