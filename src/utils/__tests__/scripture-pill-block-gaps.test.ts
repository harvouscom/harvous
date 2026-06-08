import { describe, expect, it } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { ScripturePill } from '@/components/react/TiptapScripturePill';
import { ParagraphCustom } from '@/components/react/TiptapParagraphCustom';
import { canonicalizeNoteHtmlLineBreaks } from '../note-html-linebreaks';
import { countBlankParagraphs, hasBlockGapAfter, hasBlockGapBefore, hasLostBlockGaps } from '../scripture-pill-block-gaps';
import { ensureScripturePillSpacing } from '../scripture-pill-spacing';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
  marks: {
    scripturePill: {
      attrs: { reference: {}, noteId: {}, translation: { default: null }, pillAccent: { default: null } },
      toDOM: () => ['span', 0],
    },
  },
});

describe('hasLostBlockGaps', () => {
  it('detects when blank paragraphs are removed', () => {
    const before = '<p>a</p><p><br></p><p>b</p><p><br></p><p>c</p>';
    const after = '<p>a</p><p>b</p><p>c</p>';
    expect(hasLostBlockGaps(before, after)).toBe(true);
  });

  it('allows br vs empty p canonicalization without flagging loss', () => {
    const before = '<p>a</p><p></p><p>b</p>';
    const after = '<p>a</p><p><br></p><p>b</p>';
    expect(hasLostBlockGaps(before, after)).toBe(false);
  });
});

describe('countBlankParagraphs', () => {
  it('counts empty and br-only paragraphs', () => {
    const html = '<p>a</p><p><br></p><p></p><p>b</p>';
    expect(countBlankParagraphs(html)).toBe(2);
  });
});

describe('block gap helpers', () => {
  it('detects blank sibling before pill-only paragraph', () => {
    const pillMark = schema.marks.scripturePill.create({
      reference: 'Exodus 1:1-22',
      noteId: 'note_1',
      translation: null,
    });
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('intro')]),
      schema.node('paragraph', null, []),
      schema.node('paragraph', null, [schema.text('Exodus 1:1-22', [pillMark])]),
    ]);
    const state = EditorState.create({ doc });
    let pillStart = -1;
    let pillEnd = -1;
    state.doc.descendants((node, pos) => {
      if (node.isText && node.marks.some((m) => m.type.name === 'scripturePill')) {
        pillStart = pos;
        pillEnd = pos + node.nodeSize;
      }
    });
    expect(pillStart).toBeGreaterThan(0);
    expect(hasBlockGapBefore(state.doc, pillStart)).toBe(true);
    const docWithGapAfter = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('intro')]),
      schema.node('paragraph', null, [schema.text('Exodus 1:1-22', [pillMark])]),
      schema.node('paragraph', null, []),
      schema.node('paragraph', null, [schema.text('outro')]),
    ]);
    const stateAfter = EditorState.create({ doc: docWithGapAfter });
    let pillOnlyStart = -1;
    let pillOnlyEnd = -1;
    stateAfter.doc.descendants((node, pos) => {
      if (node.isText && node.marks.some((m) => m.type.name === 'scripturePill')) {
        pillOnlyStart = pos;
        pillOnlyEnd = pos + node.nodeSize;
      }
    });
    expect(hasBlockGapAfter(stateAfter.doc, pillOnlyEnd)).toBe(true);
  });
});

describe('pill-on-own-line hydrate round-trip', () => {
  it('preserves blank-line paragraph count through setContent and hydrate spacing', () => {
    const initial = canonicalizeNoteHtmlLineBreaks(
      '<p>intro</p><p><br></p><p><span data-scripture-reference="Exodus 1:1-22" data-note-id="note_1">Exodus 1:1-22</span></p><p><br></p><p>outro</p>',
    );
    const editor = new Editor({
      extensions: [Document, ParagraphCustom, Text, ScripturePill],
      content: initial,
    });

    try {
      const tr = editor.state.tr;
      ensureScripturePillSpacing(tr, 'scripturePill', 'hydrate');
      const outgoing = canonicalizeNoteHtmlLineBreaks(editor.getHTML());
      expect(hasLostBlockGaps(initial, outgoing)).toBe(false);
      expect(countBlankParagraphs(outgoing)).toBe(countBlankParagraphs(initial));
    } finally {
      editor.destroy();
    }
  });
});
