import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { NodeSelection } from '@tiptap/pm/state';
import { isSelectionActionBarEligible } from '../selection-action-bar-eligibility';

const extensions = [
  StarterKit.configure({
    heading: false,
    link: false,
  }),
];

describe('isSelectionActionBarEligible', () => {
  it('returns false for collapsed caret', () => {
    const editor = new Editor({
      extensions,
      content: '<p>hello</p>',
    });
    try {
      editor.commands.setTextSelection(3);
      expect(isSelectionActionBarEligible(editor)).toBe(false);
    } finally {
      editor.destroy();
    }
  });

  it('returns true for non-empty prose text selection', () => {
    const editor = new Editor({
      extensions,
      content: '<p>hello world</p>',
    });
    try {
      editor.commands.setTextSelection({ from: 1, to: 6 });
      expect(isSelectionActionBarEligible(editor)).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it('returns false for NodeSelection on horizontalRule', () => {
    const editor = new Editor({
      extensions,
      content: '<p>a</p><hr><p>b</p>',
    });
    try {
      let hrPos = -1;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'horizontalRule' && hrPos === -1) {
          hrPos = pos;
        }
      });
      expect(hrPos).toBeGreaterThan(-1);

      const tr = editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, hrPos));
      editor.view.dispatch(tr);

      expect(isSelectionActionBarEligible(editor)).toBe(false);
    } finally {
      editor.destroy();
    }
  });

  it('returns false when selection range has no text (whitespace-only)', () => {
    const editor = new Editor({
      extensions,
      content: '<p>   </p>',
    });
    try {
      editor.commands.setTextSelection({ from: 1, to: 4 });
      expect(isSelectionActionBarEligible(editor)).toBe(false);
    } finally {
      editor.destroy();
    }
  });

  it('returns false after one-shot horizontalRule delete leaves collapsed caret', () => {
    const editor = new Editor({
      extensions,
      content: '<p>a</p><hr><p>b</p>',
    });
    try {
      let hrPos = -1;
      let afterHrPos = -1;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'horizontalRule' && hrPos === -1) {
          hrPos = pos;
          afterHrPos = pos + node.nodeSize;
        }
      });
      expect(hrPos).toBeGreaterThan(-1);

      editor.commands.setTextSelection(afterHrPos);
      editor.chain().deleteRange({ from: hrPos, to: afterHrPos }).run();

      expect(isSelectionActionBarEligible(editor)).toBe(false);
      expect(editor.getHTML()).not.toContain('<hr');
    } finally {
      editor.destroy();
    }
  });
});
