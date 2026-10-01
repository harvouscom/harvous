import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import { UndoRedo } from '@tiptap/extensions';
import { ScripturePill } from '../TiptapScripturePill';
import {
  ScriptureDraft,
  confirmScriptureDraftView,
  editScripturePillAsDraft,
  enterScriptureDraftView,
} from '../TiptapScriptureDraft';

/**
 * Undo around a scripture pill must move one whole step at a time — never leave a half-pill
 * (draft mark gone but no pill, or a pill without its spacer).
 *
 * A person pauses between typing, tapping ✓ and editing, so each of those is its own undo step.
 * Tests fire them in the same millisecond, which ProseMirror would merge into one group even
 * with `newGroupDelay: 0` — so the clock advances a second per transaction.
 */
let now = 1_000_000;
beforeEach(() => {
  vi.spyOn(Date, 'now').mockImplementation(() => (now += 1000));
});
afterEach(() => {
  vi.restoreAllMocks();
});

const extensions = [
  Document,
  Paragraph,
  Text,
  Bold,
  Italic,
  ScripturePill,
  ScriptureDraft,
  UndoRedo.configure({ newGroupDelay: 0 }),
];

function marksIn(editor: Editor, name: string): string[] {
  const out: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.isText && node.marks.some((m) => m.type.name === name)) out.push(node.text ?? '');
  });
  return out;
}

function countHistorySteps(editor: Editor, run: () => void): number {
  let steps = 0;
  const original = editor.view.dispatch.bind(editor.view);
  editor.view.dispatch = (tr) => {
    if (tr.docChanged && tr.getMeta('addToHistory') !== false) steps++;
    original(tr);
  };
  try {
    run();
  } finally {
    editor.view.dispatch = original;
  }
  return steps;
}

/** "I read " typed, then "John 3:16" typed and drafted — the state the ✓ is tapped from. */
function editorWithTypedDraft(): Editor {
  const editor = new Editor({ extensions, content: '<p></p>' });
  editor.commands.insertContentAt(1, 'I read ');
  editor.commands.insertContentAt(editor.state.doc.content.size - 1, 'John 3:16');
  const to = editor.state.doc.content.size - 1;
  const from = to - 'John 3:16'.length;
  expect(enterScriptureDraftView(editor.view, from, to)).toBe(true);
  return editor;
}

describe('undo around a confirmed scripture pill', () => {
  it('confirming is exactly one undo step', () => {
    const editor = editorWithTypedDraft();
    try {
      const steps = countHistorySteps(editor, () => {
        expect(confirmScriptureDraftView(editor.view, undefined, { focus: true })).toBe('John 3:16');
      });
      expect(steps).toBe(1);
      expect(marksIn(editor, 'scripturePill')).toEqual(['John 3:16']);
    } finally {
      editor.destroy();
    }
  });

  it('one undo after confirming brings the draft back, not a half-pill', () => {
    const editor = editorWithTypedDraft();
    try {
      confirmScriptureDraftView(editor.view);
      editor.commands.undo();
      expect(marksIn(editor, 'scripturePill')).toEqual([]);
      expect(marksIn(editor, 'scriptureDraft')).toEqual(['John 3:16']);
      expect(editor.state.doc.textContent).toBe('I read John 3:16');
    } finally {
      editor.destroy();
    }
  });

  it('a second undo leaves the reference as plain text', () => {
    const editor = editorWithTypedDraft();
    try {
      confirmScriptureDraftView(editor.view);
      editor.commands.undo();
      editor.commands.undo();
      expect(marksIn(editor, 'scripturePill')).toEqual([]);
      expect(marksIn(editor, 'scriptureDraft')).toEqual([]);
      expect(editor.state.doc.textContent).toBe('I read John 3:16');
    } finally {
      editor.destroy();
    }
  });

  it('redo after undo re-commits the same pill', () => {
    const editor = editorWithTypedDraft();
    try {
      confirmScriptureDraftView(editor.view);
      const committed = editor.getHTML();
      editor.commands.undo();
      editor.commands.redo();
      expect(editor.getHTML()).toBe(committed);
    } finally {
      editor.destroy();
    }
  });

  it('editing a pill and re-confirming undoes back to the edit, then to the original pill', () => {
    const editor = editorWithTypedDraft();
    try {
      confirmScriptureDraftView(editor.view);
      // Find the committed pill and reopen it as a draft (the backspace → Edit path).
      let pillFrom = -1;
      let pillTo = -1;
      editor.state.doc.descendants((node, pos) => {
        if (node.isText && node.marks.some((m) => m.type.name === 'scripturePill')) {
          pillFrom = pos;
          pillTo = pos + node.nodeSize;
        }
      });
      expect(editScripturePillAsDraft(editor.view, pillFrom, pillTo)).toBe(true);
      expect(marksIn(editor, 'scriptureDraft')).toEqual(['John 3:16']);

      // Change the verse in place, then confirm the edit.
      editor.view.dispatch(editor.state.tr.insertText('17', pillTo - 2, pillTo));
      expect(confirmScriptureDraftView(editor.view)).toBe('John 3:17');
      expect(marksIn(editor, 'scripturePill')).toEqual(['John 3:17']);

      editor.commands.undo(); // the confirm
      expect(marksIn(editor, 'scriptureDraft')).toEqual(['John 3:17']);
      editor.commands.undo(); // the verse edit
      editor.commands.undo(); // reopening the pill
      expect(marksIn(editor, 'scriptureDraft')).toEqual([]);
      expect(marksIn(editor, 'scripturePill')).toEqual(['John 3:16']);
    } finally {
      editor.destroy();
    }
  });
});
