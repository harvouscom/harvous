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
  scriptureQuoteReferenceValue,
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

/**
 * Block structure, which nothing asserted before — the existing tests only counted pills and
 * checked accents, which is how "inserting a quote adds an extra line after the quote" shipped.
 * The trailing blank paragraph used to be appended unconditionally, and
 * canonicalizeNoteHtmlLineBreaks turns `<p></p>` into `<p><br></p>`, so it persisted as a
 * visible gap between the quote and whatever the reader wrote next.
 */
describe('quote insert block structure', () => {
  const blockShape = (editor: Editor) => {
    const out: string[] = [];
    editor.state.doc.forEach((node) => {
      out.push(node.content.size === 0 ? `${node.type.name}:empty` : node.type.name);
    });
    return out;
  };

  const insertAt = (editor: Editor, caret: number | null) =>
    insertScriptureQuoteAt(editor, {
      excerpt: 'For God so loved the world',
      reference: 'John 3:16',
      translation: 'NET',
      sourceNoteId: 'note_1',
      sourcePillBoundaries: null,
      sourcePillReference: 'John 3:16',
      sourcePillTranslation: 'NET',
      lastEditorSelection: caret === null ? null : { from: caret, to: caret, at: Date.now() },
    });

  it('leaves a place to keep typing when the quote lands at the end of the note', () => {
    const editor = new Editor({ extensions, content: '<p>My own thoughts here</p>' });
    try {
      const end = editor.state.doc.content.size - 1;
      insertAt(editor, end);
      expect(blockShape(editor)).toEqual(['paragraph', 'blockquote', 'paragraph', 'paragraph:empty']);
    } finally {
      editor.destroy();
    }
  });

  it('does not add a blank line when the note continues after the quote', () => {
    const editor = new Editor({ extensions, content: '<p>Hello world here</p>' });
    try {
      insertAt(editor, 6);
      expect(blockShape(editor)).toEqual(['paragraph', 'blockquote', 'paragraph', 'paragraph']);
      expect(blockShape(editor).filter((b) => b === 'paragraph:empty')).toHaveLength(0);
    } finally {
      editor.destroy();
    }
  });

  it('does not stack a second blank line onto one the note already ended with', () => {
    const editor = new Editor({ extensions, content: '<p>My own thoughts here</p><p></p>' });
    try {
      const end = editor.state.doc.content.size - 1;
      insertAt(editor, end);
      expect(blockShape(editor).filter((b) => b === 'paragraph:empty')).toHaveLength(1);
    } finally {
      editor.destroy();
    }
  });

  it('emits exactly one empty paragraph at most, wherever the caret was', () => {
    for (const [content, caret] of [
      ['<p>One</p>', null],
      ['<p>One</p><p>Two</p>', 3],
      ['<p></p>', 1],
    ] as const) {
      const editor = new Editor({ extensions, content });
      try {
        insertAt(editor, caret);
        const empties = blockShape(editor).filter((b) => b === 'paragraph:empty');
        expect(empties.length, `content=${content} caret=${caret}`).toBeLessThanOrEqual(1);
      } finally {
        editor.destroy();
      }
    }
  });
});

/**
 * The shape below is the real one, from note_1783229089806 ("The first book"): a rendered
 * scripture pill sitting inside `data-scripture-quote-reference`. Its inner double quotes end the
 * attribute early, so the parser renders the rest of the blockquote tag as visible text and the
 * reader sees a stray `Genesis 1:1-2" data-scripture-quote-translation="NLT">` under the quote.
 */
describe('scriptureQuoteReferenceValue', () => {
  const PILL_MARKUP =
    '<span data-scripture-reference="Genesis 1:1-2" data-note-id="note_1782013851464" data-scripture-translation="NLT" class="scripture-pill scripture-pill-clickable">Genesis 1:1-2</span>';

  it('reduces rendered pill markup to the reference it labels', () => {
    expect(scriptureQuoteReferenceValue(PILL_MARKUP)).toBe('Genesis 1:1-2');
  });

  it('drops the truncated tag a corrupted attribute parses back into', () => {
    // What `getAttribute` returns once a browser has parsed the damaged markup above.
    expect(scriptureQuoteReferenceValue('<span data-scripture-reference=')).toBeNull();
  });

  it('leaves a plain reference alone', () => {
    expect(scriptureQuoteReferenceValue('Genesis 1:1-2')).toBe('Genesis 1:1-2');
  });

  it('inserts a quote with a clean attribute even when handed pill markup', () => {
    const editor = new Editor({ extensions, content: '<p>Before</p>' });
    try {
      insertScriptureQuoteAt(editor, {
        excerpt: 'In the beginning God created the heavens and the earth.',
        reference: PILL_MARKUP,
        translation: 'NLT',
        sourceNoteId: 'note_1782013851464',
      });
      const html = editor.getHTML();
      expect(html).toContain('data-scripture-quote-reference="Genesis 1:1-2"');
      expect(html).not.toMatch(/data-scripture-quote-reference="[^"]*<span/);
      // The tag has to survive a parse, which is the property the corruption broke.
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const quote = parsed.querySelector('blockquote');
      expect(quote?.getAttribute('data-scripture-quote-reference')).toBe('Genesis 1:1-2');
      expect(quote?.getAttribute('data-scripture-quote-translation')).toBe('NLT');
      expect(parsed.body.textContent).not.toContain('data-scripture-quote-translation');
    } finally {
      editor.destroy();
    }
  });
});
