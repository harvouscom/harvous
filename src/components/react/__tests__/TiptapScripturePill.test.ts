import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { ScripturePill } from '../TiptapScripturePill';

/**
 * Exercises the real ScripturePill mark extension (config + the ProseMirror
 * plugins in addProseMirrorPlugins) against a headless editor. These guard the
 * "reliable editing" invariants that have no other direct coverage:
 *   - typing immediately after a pill never inherits the pill mark
 *   - a caret that lands inside a pill snaps back out
 *   - parseHTML/renderHTML preserve every pill attribute on a save/load round-trip
 */
const extensions = [Document, Paragraph, Text, ScripturePill];

function pillMarksAt(editor: Editor, pos: number): string[] {
  return editor.state.doc.resolve(pos).marks().map((m) => m.type.name);
}

describe('ScripturePill mark config', () => {
  it('is non-inclusive and excludes all marks to prevent stickiness', () => {
    expect(ScripturePill.config.inclusive).toBe(false);
    expect(ScripturePill.config.excludes).toBe('_');
  });
});

describe('ScripturePill serialization round-trip', () => {
  it('preserves reference, noteId, translation, and accent through getHTML', () => {
    const html =
      '<p><span data-scripture-reference="John 3:16" data-note-id="note_42" ' +
      'data-scripture-translation="ESV" data-pill-accent="amber" class="scripture-pill">John 3:16</span></p>';
    const editor = new Editor({ extensions, content: html });
    try {
      const out = editor.getHTML();
      expect(out).toContain('data-scripture-reference="John 3:16"');
      expect(out).toContain('data-note-id="note_42"');
      expect(out).toContain('data-scripture-translation="ESV"');
      expect(out).toContain('data-pill-accent="amber"');
    } finally {
      editor.destroy();
    }
  });

  it('parses a pill with no noteId without dropping the mark', () => {
    const editor = new Editor({
      extensions,
      content: '<p><span data-scripture-reference="Romans 8:28">Romans 8:28</span></p>',
    });
    try {
      let pillCount = 0;
      editor.state.doc.descendants((node) => {
        if (node.marks.some((m) => m.type.name === 'scripturePill')) pillCount += 1;
      });
      expect(pillCount).toBeGreaterThan(0);
      expect(editor.getHTML()).toContain('data-scripture-reference="Romans 8:28"');
    } finally {
      editor.destroy();
    }
  });
});

describe('ScripturePill stickiness', () => {
  it('does not apply the pill mark to text typed after the pill', () => {
    const editor = new Editor({
      extensions,
      content:
        '<p>see <span data-scripture-reference="John 3:16" data-note-id="note_1">John 3:16</span></p>',
    });
    try {
      // Caret at the very end of the document (immediately after the pill).
      editor.commands.setTextSelection(editor.state.doc.content.size);
      editor.commands.insertContent(' and more');

      const html = editor.getHTML();
      // The appended prose must live outside the pill span.
      expect(html).toContain('</span> and more');

      // No text node carrying the prose should hold a scripturePill mark.
      let prosePilled = false;
      editor.state.doc.descendants((node) => {
        if (
          node.isText &&
          node.text?.includes('and more') &&
          node.marks.some((m) => m.type.name === 'scripturePill')
        ) {
          prosePilled = true;
        }
      });
      expect(prosePilled).toBe(false);
    } finally {
      editor.destroy();
    }
  });
});

describe('ScripturePill caret snapping', () => {
  it('moves a caret placed inside the pill to just after it before typing', () => {
    const editor = new Editor({
      extensions,
      content:
        '<p>see <span data-scripture-reference="John 3:16" data-note-id="note_1">John 3:16</span> rest</p>',
    });
    try {
      // Find a position strictly inside the pill text.
      let pillFrom = -1;
      let pillTo = -1;
      editor.state.doc.descendants((node, pos) => {
        if (node.isText && node.marks.some((m) => m.type.name === 'scripturePill')) {
          pillFrom = pos;
          pillTo = pos + node.nodeSize;
        }
      });
      expect(pillFrom).toBeGreaterThan(0);

      const insidePos = pillFrom + 2;
      // setTextSelection dispatches a transaction; the snap plugin runs in its
      // appendTransaction and should push the caret to the end of the mark range.
      editor.commands.setTextSelection(insidePos);

      const caret = editor.state.selection.from;
      expect(caret).toBe(pillTo);
      // The snapped caret sits outside the pill mark.
      expect(pillMarksAt(editor, caret)).not.toContain('scripturePill');
    } finally {
      editor.destroy();
    }
  });
});

describe('ScripturePill deletion', () => {
  it('removes the full pill atomically via deleteRange (second backspace confirm)', () => {
    const editor = new Editor({
      extensions,
      content:
        '<p>see <span data-scripture-reference="John 3:16" data-note-id="note_1">John 3:16</span> rest</p>',
    });
    try {
      let pillStart = -1;
      let pillEnd = -1;
      editor.state.doc.descendants((node, pos) => {
        if (node.isText && node.marks.some((m) => m.type.name === 'scripturePill')) {
          if (pillStart < 0) pillStart = pos;
          pillEnd = pos + node.nodeSize;
        }
      });
      expect(pillStart).toBeGreaterThan(0);
      expect(pillEnd).toBeGreaterThan(pillStart);

      editor.chain().deleteRange({ from: pillStart, to: pillEnd }).run();

      const html = editor.getHTML();
      expect(html).not.toContain('scripture-pill');
      expect(html).not.toContain('John 3:16');
      expect(html).toContain('see');
      expect(html).toContain('rest');
    } finally {
      editor.destroy();
    }
  });
});
