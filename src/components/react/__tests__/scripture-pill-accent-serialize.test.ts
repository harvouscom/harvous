import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { ScripturePill } from '../TiptapScripturePill';

const extensions = [Document, Paragraph, Text, ScripturePill];

function applyPillAccent(editor: Editor, accent: string | null) {
  const markType = editor.state.schema.marks.scripturePill;
  let from = 0;
  let to = 0;
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    const m = node.marks.find((x) => x.type.name === 'scripturePill');
    if (m) {
      from = pos;
      to = pos + node.nodeSize;
    }
  });
  expect(to).toBeGreaterThan(from);
  const existing = editor.state.doc.nodeAt(from + 1)?.marks.find((m) => m.type.name === 'scripturePill');
  expect(existing).toBeTruthy();
  const tr = editor.state.tr;
  tr.removeMark(from, to, markType);
  tr.addMark(from, to, markType.create({ ...existing!.attrs, pillAccent: accent }));
  editor.view.dispatch(tr);
  return { from, to };
}

describe('ScripturePill pillAccent serialization', () => {
  it('getHTML includes data-pill-accent after addMark', () => {
    const editor = new Editor({
      extensions,
      content:
        '<p><span data-scripture-reference="John 3:16" data-note-id="note_1" class="scripture-pill">John 3:16</span></p>',
    });
    try {
      applyPillAccent(editor, 'warmAmber');
      const html = editor.getHTML();
      expect(html).toContain('data-pill-accent="warmAmber"');
    } finally {
      editor.destroy();
    }
  });

  it('live DOM span gets data-pill-accent after addMark', () => {
    const editor = new Editor({
      extensions,
      content:
        '<p><span data-scripture-reference="John 3:16" data-note-id="note_1" class="scripture-pill">John 3:16</span></p>',
    });
    try {
      applyPillAccent(editor, 'warmAmber');
      const pill = editor.view.dom.querySelector('.scripture-pill[data-scripture-reference="John 3:16"]');
      expect(pill).toBeTruthy();
      expect(pill!.getAttribute('data-pill-accent')).toBe('warmAmber');
    } finally {
      editor.destroy();
    }
  });
});
