import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { ScripturePill } from '@/components/react/TiptapScripturePill';
import { ScriptureQuoteBlockquote } from '@/components/react/TiptapScriptureQuoteBlockquote';
import {
  insertScriptureQuoteAt,
  quoteReferencesAlign,
  resolveScriptureQuoteInsertPos,
  shouldOmitScriptureQuoteAttribution,
} from '@/utils/insert-scripture-quote';

const extensions = [Document, Paragraph, Text, ScriptureQuoteBlockquote, ScripturePill];

function editorWithPill(): Editor {
  return new Editor({
    extensions,
    content:
      '<p>Before <span data-scripture-reference="John 3:16" data-note-id="note_1" data-scripture-translation="NET" class="scripture-pill">John 3:16</span> after</p>',
  });
}

describe('insertScriptureQuoteAt', () => {
  it('inserts blockquote with attribution when caret is not near source pill', () => {
    const editor = editorWithPill();
    try {
      const ok = insertScriptureQuoteAt(editor, {
        excerpt: 'For God so loved the world',
        reference: 'John 3:16',
        translation: 'NET',
        sourceNoteId: 'note_1',
        sourcePillBoundaries: { from: 7, to: 16 },
        sourcePillReference: 'John 3:16',
        sourcePillTranslation: 'NET',
        lastEditorSelection: {
          from: editor.state.doc.content.size - 1,
          to: editor.state.doc.content.size - 1,
          at: Date.now(),
        },
      });
      expect(ok).not.toBeNull();
      const html = editor.getHTML();
      expect(html).toContain('data-scripture-quote-accent="neutral"');
      expect(html).toMatch(/data-scripture-reference="John 3:16"/);
    } finally {
      editor.destroy();
    }
  });

  it('omits attribution when inserting immediately after matching source pill', () => {
    const editor = editorWithPill();
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

      const pillCountBefore = (editor.getHTML().match(/data-scripture-reference/g) ?? []).length;
      insertScriptureQuoteAt(editor, {
        excerpt: 'For God so loved the world',
        reference: 'John 3:16',
        translation: 'NET',
        sourceNoteId: 'note_1',
        sourcePillBoundaries: { from: pillFrom, to: pillTo },
        sourcePillReference: 'John 3:16',
        sourcePillTranslation: 'NET',
        lastEditorSelection: null,
      });

      const html = editor.getHTML();
      expect(html).toContain('data-scripture-quote-accent="neutral"');
      expect(html).toContain('For God so loved the world');
      const pillCountAfter = (html.match(/data-scripture-reference/g) ?? []).length;
      expect(pillCountAfter).toBe(pillCountBefore);
    } finally {
      editor.destroy();
    }
  });

  it('omits attribution when quote reference is a subset of the source pill', () => {
    const editor = new Editor({
      extensions,
      content:
        '<p><span data-scripture-reference="Genesis 1:1-2" data-note-id="note_1" data-scripture-translation="NLT" class="scripture-pill">Genesis 1:1-2</span></p>',
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

      insertScriptureQuoteAt(editor, {
        excerpt: 'In the beginning God created the heavens and the earth.',
        reference: 'Genesis 1:1',
        translation: 'NLT',
        sourceNoteId: 'note_1',
        sourcePillBoundaries: { from: pillFrom, to: pillTo },
        sourcePillReference: 'Genesis 1:1-2',
        sourcePillTranslation: 'NLT',
        lastEditorSelection: null,
      });

      expect((editor.getHTML().match(/data-scripture-reference/g) ?? []).length).toBe(1);
    } finally {
      editor.destroy();
    }
  });

  it('omits attribution when source pill sits in the paragraph above the blockquote', () => {
    const editor = new Editor({
      extensions,
      content:
        '<p>The book of Matthew. Not Genesis.</p><p><span data-scripture-reference="Genesis 1:1-2" data-note-id="note_1" data-scripture-translation="NLT" class="scripture-pill">Genesis 1:1-2</span></p>',
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

      insertScriptureQuoteAt(editor, {
        excerpt: 'In the beginning God created the heavens and the earth.',
        reference: 'Genesis 1:1-2',
        translation: 'NLT',
        sourceNoteId: 'note_1',
        sourcePillBoundaries: { from: pillFrom, to: pillTo },
        sourcePillReference: 'Genesis 1:1-2',
        sourcePillTranslation: 'NLT',
        lastEditorSelection: null,
      });

      const html = editor.getHTML();
      expect(html).toContain('data-scripture-quote-accent');
      expect((html.match(/data-scripture-reference/g) ?? []).length).toBe(1);
    } finally {
      editor.destroy();
    }
  });
});

describe('resolveScriptureQuoteInsertPos', () => {
  it('prefers recent editor selection over pill end', () => {
    const editor = editorWithPill();
    try {
      const recentPos = editor.state.doc.content.size - 1;
      const pos = resolveScriptureQuoteInsertPos(editor, {
        lastEditorSelection: { from: recentPos, to: recentPos, at: Date.now() },
        sourcePillBoundaries: { from: 7, to: 20 },
      });
      expect(pos).toBe(recentPos);
    } finally {
      editor.destroy();
    }
  });
});

describe('quoteReferencesAlign', () => {
  it('treats a verse subset as matching the pill range', () => {
    expect(quoteReferencesAlign('Genesis 1:1-2', 'Genesis 1:1')).toBe(true);
  });
});

describe('shouldOmitScriptureQuoteAttribution', () => {
  it('returns true when insert is right after matching pill', () => {
    const editor = editorWithPill();
    try {
      let pillTo = 0;
      editor.state.doc.descendants((node, pos) => {
        if (node.marks.some((m) => m.type.name === 'scripturePill')) {
          pillTo = pos + node.nodeSize;
        }
      });
      const omit = shouldOmitScriptureQuoteAttribution(editor.state.doc, pillTo, {
        sourcePillBoundaries: { from: 0, to: pillTo },
        sourcePillReference: 'John 3:16',
        sourcePillTranslation: 'NET',
        reference: 'John 3:16',
        translation: 'NET',
      });
      expect(omit).toBe(true);
    } finally {
      editor.destroy();
    }
  });
});
