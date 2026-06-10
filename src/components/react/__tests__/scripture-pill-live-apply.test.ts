import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { ScripturePill } from '../TiptapScripturePill';
import { detectScriptureReferences } from '@/utils/scripture-detector';
import { detectScriptureReferenceEndingAtCursor } from '@/utils/scripture-pill-position';
import { findAdjacentPillBoundaries } from '@/utils/scripture-pill-adjacent';

const extensions = [Document, Paragraph, Text, ScripturePill];

function applyPillAtCursor(editor: Editor): boolean {
  const { from } = editor.state.selection;
  const result = detectScriptureReferenceEndingAtCursor(editor.state.doc, from);
  if (!result) return false;

  const markType = editor.state.schema.marks.scripturePill;
  if (!markType) return false;

  return editor.commands.command(({ tr, dispatch }) => {
    if (!dispatch) return true;
    tr.addMark(
      result.from,
      result.to,
      markType.create({ reference: result.reference, noteId: 'pending', translation: null }),
    );
    dispatch(tr);
    return true;
  });
}

describe('live scripture pill apply', () => {
  it('applies pill mark after Exodus 1:1-22 + space trigger position', () => {
    const editor = new Editor({ extensions, content: '<p></p>' });
    try {
      editor.commands.insertContent('Exodus 1:1-22 ');
      const cursorPos = editor.state.selection.from;
      const result = detectScriptureReferenceEndingAtCursor(editor.state.doc, cursorPos);
      expect(result).not.toBeNull();
      expect(result!.reference).toBe('Exodus 1:1-22');

      const applied = applyPillAtCursor(editor);
      expect(applied).toBe(true);

      let pillCount = 0;
      editor.state.doc.descendants((node) => {
        if (node.marks.some((m) => m.type.name === 'scripturePill')) pillCount += 1;
      });
      expect(pillCount).toBeGreaterThan(0);
      expect(editor.getHTML()).toContain('data-scripture-reference');
    } finally {
      editor.destroy();
    }
  });

  it('applies one pill for Exodus 5:1-2, not chapter-only split', () => {
    const editor = new Editor({ extensions, content: '<p></p>' });
    try {
      editor.commands.insertContent('Exodus 5:1-2 ');
      const result = detectScriptureReferenceEndingAtCursor(editor.state.doc, editor.state.selection.from);
      expect(result).not.toBeNull();
      expect(result!.reference).toBe('Exodus 5:1-2');

      applyPillAtCursor(editor);

      const pillRefs: string[] = [];
      editor.state.doc.descendants((node) => {
        const mark = node.marks.find((m) => m.type.name === 'scripturePill');
        if (mark) pillRefs.push(mark.attrs.reference as string);
      });
      expect(pillRefs).toEqual(['Exodus 5:1-2']);
    } finally {
      editor.destroy();
    }
  });
});

const pmSchema = new Schema({
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

describe('detectScriptureReferences fallback', () => {
  it('still finds refs when cursor-anchored position mapping would defer', () => {
    const text = 'Exodus 1:1-22';
    const refs = detectScriptureReferences(text);
    expect(refs.length).toBeGreaterThan(0);
    expect(refs[refs.length - 1].reference).toBe('Exodus 1:1-22');
  });
});

describe('findAdjacentPillBoundaries backspace spacer', () => {
  it('returns pill boundaries when cursor is on single whitespace spacer after pill (gap 1)', () => {
    const state = stateWithPillAndSpacers('t ', 'Exodus 1:1-22', ' w');
    const pillEnd = findPillEnd(state.doc);
    const spacerPos = pillEnd + 1;
    const result = findAdjacentPillBoundaries(state.doc, spacerPos, 'before');
    expect(result).not.toBeNull();
    expect(result!.end).toBe(spacerPos);
  });

  it('returns pill boundaries when cursor is flush at pill end (gap 0)', () => {
    const state = stateWithPillAndSpacers('t ', 'Exodus 1:1-22', ' w');
    const pillEnd = findPillEnd(state.doc);
    const result = findAdjacentPillBoundaries(state.doc, pillEnd, 'before');
    expect(result).not.toBeNull();
    expect(result!.end).toBe(pillEnd);
  });
});

function stateWithPillAndSpacers(before: string, pillText: string, after: string) {
  const doc = pmSchema.node('doc', null, [
    pmSchema.node('paragraph', null, [
      pmSchema.text(before),
      pmSchema.text(pillText, [
        pmSchema.marks.scripturePill.create({ reference: pillText, noteId: 'pending', translation: null }),
      ]),
      pmSchema.text(after),
    ]),
  ]);
  return EditorState.create({ doc });
}

function findPillEnd(doc: any): number {
  let end = -1;
  doc.descendants((node: any, pos: number) => {
    if (node.isText && node.marks.some((m: any) => m.type.name === 'scripturePill')) {
      end = pos + node.nodeSize;
    }
  });
  return end;
}
