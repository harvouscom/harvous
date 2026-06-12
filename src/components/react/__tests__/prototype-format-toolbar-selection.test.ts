import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Text from '@tiptap/extension-text';
import Heading from '@tiptap/extension-heading';
import { ParagraphCustom } from '../TiptapParagraphCustom';
import { BoldCustom } from '../TiptapBoldCustom';
import {
  isEmptyTrailingDocEndSelection,
  pickFormatToolbarSelection,
  resolveFormatToolbarSelection,
  runFormatCommandWithPreservedSelection,
  shouldDeferEditorContentSyncForChromeFocus,
  isEditorFormatChromeFocused,
} from '@/utils/prototype-format-toolbar-selection';

const extensions = [
  Document,
  ParagraphCustom,
  Text,
  BoldCustom,
  Heading.configure({ levels: [2, 3] }),
];

describe('prototype format toolbar selection preservation', () => {
  it('isEditorFormatChromeFocused detects portaled toolbar hosts', () => {
    const host = document.createElement('div');
    host.setAttribute('data-prototype-format-toolbar', '');
    const button = document.createElement('button');
    host.appendChild(button);
    document.body.appendChild(host);

    expect(isEditorFormatChromeFocused(button)).toBe(true);
    host.remove();
  });

  it('shouldDeferEditorContentSyncForChromeFocus when toolbar button is active', () => {
    const host = document.createElement('div');
    host.className = 'proto-editor-bottom-bar';
    const button = document.createElement('button');
    host.appendChild(button);
    document.body.appendChild(host);

    expect(
      shouldDeferEditorContentSyncForChromeFocus({
        editorIsFocused: false,
        proseMirrorFocused: false,
        formatToolbarPointerDown: false,
        activeElement: button,
      }),
    ).toBe(true);
    host.remove();
  });

  it('resolveFormatToolbarSelection prefers the frozen range', () => {
    expect(resolveFormatToolbarSelection({ from: 3, to: 3 }, 42, 42)).toEqual({ from: 3, to: 3 });
    expect(resolveFormatToolbarSelection(null, 5, 8)).toEqual({ from: 5, to: 8 });
  });

  it('pickFormatToolbarSelection rejects doc-end frozen range when lastInBody exists', () => {
    const editor = new Editor({
      extensions,
      content: '<p>first paragraph</p><p></p>',
    });

    try {
      const docSize = editor.state.doc.content.size;
      const lastInBody = { from: 8, to: 8 };
      editor.commands.setTextSelection(docSize);

      const doc = editor.state.doc;
      const selFrom = editor.state.selection.from;
      const lastChildText = doc.content.lastChild?.textContent ?? '(none)';
      expect(lastChildText.trim().length).toBe(0);

      expect(isEmptyTrailingDocEndSelection(doc, selFrom, selFrom)).toBe(true);

      const picked = pickFormatToolbarSelection({
        frozen: { from: selFrom, to: selFrom },
        liveFrom: selFrom,
        liveTo: selFrom,
        docSize,
        lastInBody,
        isEmptyTrailingDocEnd: (from, to) => isEmptyTrailingDocEndSelection(doc, from, to),
      });

      expect(picked).toEqual(lastInBody);
    } finally {
      editor.destroy();
    }
  });

  it('applies heading at frozen caret instead of live doc-end selection', () => {
    const editor = new Editor({
      extensions,
      content: '<p>first paragraph</p><p>second paragraph</p>',
    });

    try {
      const frozenCaret = 8;
      formatToolbarSelectionSimulatedCollapse(editor);

      const range = pickFormatToolbarSelection({
        frozen: { from: frozenCaret, to: frozenCaret },
        liveFrom: editor.state.selection.from,
        liveTo: editor.state.selection.to,
        docSize: editor.state.doc.content.size,
        lastInBody: null,
        isEmptyTrailingDocEnd: (from, to) =>
          isEmptyTrailingDocEndSelection(editor.state.doc, from, to),
      });

      runFormatCommandWithPreservedSelection(editor, range, (chain) => chain.toggleHeading({ level: 2 }));

      expect(editor.getHTML()).toContain('<h2>first paragraph</h2>');
      expect(editor.getHTML()).toContain('<p>second paragraph</p>');
      expect(editor.state.selection.from).toBeLessThan(editor.state.doc.content.size - 4);
      expect(editor.isActive('heading', { level: 2 })).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it('applies bold after simulated selection collapse to doc end', () => {
    const editor = new Editor({
      extensions,
      content: '<p>bold me here</p><p></p>',
    });

    try {
      const doc = editor.state.doc;
      const firstBlockSize = doc.content.firstChild?.content.size ?? 0;
      editor.commands.setTextSelection({ from: 1, to: 1 + firstBlockSize });
      const lastInBody = {
        from: editor.state.selection.from,
        to: editor.state.selection.to,
      };
      formatToolbarSelectionSimulatedCollapse(editor);

      const liveFrom = editor.state.selection.from;
      const liveTo = editor.state.selection.to;

      const range = pickFormatToolbarSelection({
        frozen: { from: liveFrom, to: liveTo },
        liveFrom,
        liveTo,
        docSize: doc.content.size,
        lastInBody,
        isEmptyTrailingDocEnd: (from, to) => isEmptyTrailingDocEndSelection(doc, from, to),
      });

      expect(range).toEqual(lastInBody);

      const ran = runFormatCommandWithPreservedSelection(editor, range, (chain) => chain.toggleBold());
      expect(ran).toBe(true);

      expect(editor.getHTML()).toContain('<strong>bold me here</strong>');
    } finally {
      editor.destroy();
    }
  });

  it('applies bold when the editor lost DOM focus before the command', () => {
    const editor = new Editor({
      extensions,
      content: '<p>hello world</p><p></p>',
    });

    try {
      const doc = editor.state.doc;
      const firstBlockSize = doc.content.firstChild?.content.size ?? 0;
      editor.commands.setTextSelection({ from: 1, to: 1 + firstBlockSize });
      const range = {
        from: editor.state.selection.from,
        to: editor.state.selection.to,
      };
      (editor.view.dom as HTMLElement).blur();
      editor.commands.setTextSelection(doc.content.size);

      const ran = runFormatCommandWithPreservedSelection(editor, range, (chain) => chain.toggleBold());
      expect(ran).toBe(true);
      expect(editor.getHTML()).toContain('<strong>hello world</strong>');
    } finally {
      editor.destroy();
    }
  });

  it('keeps a text selection when toggling heading on the portaled toolbar path', () => {
    const editor = new Editor({
      extensions,
      content: '<p>alpha beta gamma</p><p>tail</p>',
    });

    try {
      const frozenRange = { from: 2, to: 7 };
      editor.commands.setTextSelection(editor.state.doc.content.size);

      runFormatCommandWithPreservedSelection(editor, frozenRange, (chain) => chain.toggleHeading({ level: 3 }));

      expect(editor.getHTML()).toBe('<h3>alpha beta gamma</h3><p>tail</p>');
      expect(editor.state.selection.from).toBe(2);
      expect(editor.state.selection.to).toBe(7);
    } finally {
      editor.destroy();
    }
  });
});

/** Simulate portaled toolbar click: live selection jumps to document end. */
function formatToolbarSelectionSimulatedCollapse(editor: Editor): void {
  editor.commands.setTextSelection(8);
  editor.commands.setTextSelection(editor.state.doc.content.size);
}
