import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import { ScripturePill } from '../TiptapScripturePill';
import {
  ScriptureDraft,
  confirmScriptureDraftView,
  draftShouldDissolveOnDigitsRemoved,
  scriptureDraftInputDecision,
} from '../TiptapScriptureDraft';

const extensions = [Document, Paragraph, Text, Bold, Italic, ScripturePill, ScriptureDraft];

/** Editor with `draftText` covered by a scriptureDraft mark (parseHTML is empty by design). */
function editorWithDraft(draftText: string, attrs: Record<string, unknown> = {}): Editor {
  const editor = new Editor({ extensions, content: `<p>${draftText}</p>` });
  const draftType = editor.state.schema.marks.scriptureDraft;
  const tr = editor.state.tr;
  tr.addMark(1, 1 + draftText.length, draftType.create(attrs));
  tr.setMeta('addToHistory', false);
  editor.view.dispatch(tr);
  return editor;
}

function draftRanges(editor: Editor): Array<{ from: number; to: number }> {
  const out: Array<{ from: number; to: number }> = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.marks.some((m) => m.type.name === 'scriptureDraft')) {
      out.push({ from: pos, to: pos + node.nodeSize });
    }
  });
  return out;
}

describe('draftShouldDissolveOnDigitsRemoved', () => {
  it('dissolves an edit-draft whose numbers are gone', () => {
    expect(draftShouldDissolveOnDigitsRemoved('Exodus', true)).toBe(true);
    expect(draftShouldDissolveOnDigitsRemoved('Exodus ', true)).toBe(true);
  });

  it('keeps an edit-draft that still has any digit', () => {
    expect(draftShouldDissolveOnDigitsRemoved('Exodus 5', true)).toBe(false);
    expect(draftShouldDissolveOnDigitsRemoved('Exodus 5:1-10', true)).toBe(false);
  });

  it('never dissolves a from-scratch draft — "Exodus" may be mid-typing', () => {
    expect(draftShouldDissolveOnDigitsRemoved('Exodus', false)).toBe(false);
  });
});

describe('digits-removed dissolve (live, in the editor)', () => {
  it('deleting the numbers out of an edited pill dissolves it to plain text', () => {
    const editor = editorWithDraft('Exodus 5:1', { originalReference: 'Exodus 5:1' });
    try {
      expect(draftRanges(editor)).toHaveLength(1);
      // Delete " 5:1", leaving just the book name — the reported trap.
      editor.commands.deleteRange({ from: 1 + 'Exodus'.length, to: 1 + 'Exodus 5:1'.length });
      expect(draftRanges(editor)).toHaveLength(0);
      expect(editor.state.doc.textContent).toBe('Exodus');
      // No formatting left behind either.
      let bold = false;
      editor.state.doc.descendants((n) => {
        if (n.marks.some((m) => m.type.name === 'bold')) bold = true;
      });
      expect(bold).toBe(false);
    } finally {
      editor.destroy();
    }
  });

  it('a from-scratch draft survives losing its digits mid-edit', () => {
    const editor = editorWithDraft('Exodus 5:1');
    try {
      editor.commands.deleteRange({ from: 1 + 'Exodus'.length, to: 1 + 'Exodus 5:1'.length });
      expect(draftRanges(editor)).toHaveLength(1);
    } finally {
      editor.destroy();
    }
  });
});

describe('scriptureDraftInputDecision', () => {
  const INVALID = 'Exodus 16:1315'; // chapter 16 tops out at 36 — parses, cannot resolve

  it('blocks input that keeps an invalid reference invalid', () => {
    expect(scriptureDraftInputDecision(INVALID, INVALID.length, INVALID.length, '9')).toBe('block');
  });

  it('allows the repair keystroke — the dash of 16:13-15', () => {
    const at = 'Exodus 16:13'.length;
    expect(scriptureDraftInputDecision(INVALID, at, at, '-')).toBe('allow');
  });

  it('whitespace policy: iOS allows (double-space invariant), desktop blocks', () => {
    // Default 'allow' is the iOS path — intercepting space there breaks
    // double-space-to-period, and detach->finalize resolves the draft instead.
    expect(scriptureDraftInputDecision(INVALID, INVALID.length, INVALID.length, ' ')).toBe('allow');
    // Desktop passes 'block': the user asked for the lock to include space.
    expect(
      scriptureDraftInputDecision(INVALID, INVALID.length, INVALID.length, ' ', { whitespace: 'block' }),
    ).toBe('block');
    // But a space into a VALID draft is never blocked, whatever the policy.
    expect(
      scriptureDraftInputDecision('Exodus 16:13', 12, 12, ' ', { whitespace: 'block' }),
    ).toBe('allow');
  });

  it('leaves valid and pending drafts entirely alone', () => {
    expect(scriptureDraftInputDecision('Exodus 16:13', 12, 12, '-')).toBe('allow');
    expect(scriptureDraftInputDecision('Exodus', 6, 6, ' ')).toBe('allow');
  });

  it('allows a replacement selection that repairs', () => {
    // Selecting "1315" and typing "13" -> "Exodus 16:13", valid.
    const from = 'Exodus 16:'.length;
    expect(scriptureDraftInputDecision(INVALID, from, INVALID.length, '13')).toBe('allow');
  });
});

describe('abandoning an invalid draft (onInvalid: finalize)', () => {
  it('keep (default): the ✓ path leaves the draft open to fix', () => {
    const editor = editorWithDraft('Exodus 16:1315');
    try {
      const result = confirmScriptureDraftView(editor.view, 2);
      expect(result).toBeNull();
      expect(draftRanges(editor)).toHaveLength(1);
    } finally {
      editor.destroy();
    }
  });

  it('finalize on a from-scratch draft drops to clean prose — no pill, no bold', () => {
    const editor = editorWithDraft('Exodus 16:1315');
    try {
      // Give it bold too, mimicking formatting picked up while drafting.
      const boldType = editor.state.schema.marks.bold;
      const tr = editor.state.tr;
      tr.addMark(1, 1 + 'Exodus 16:1315'.length, boldType.create());
      editor.view.dispatch(tr);

      confirmScriptureDraftView(editor.view, 2, { onInvalid: 'finalize' });

      expect(draftRanges(editor)).toHaveLength(0);
      expect(editor.state.doc.textContent).toBe('Exodus 16:1315');
      let styled = false;
      editor.state.doc.descendants((n) => {
        if (n.marks.some((m) => ['bold', 'scripturePill', 'scriptureDraft'].includes(m.type.name))) {
          styled = true;
        }
      });
      expect(styled).toBe(false);
    } finally {
      editor.destroy();
    }
  });

  it('finalize on an edit-origin draft restores the original pill', () => {
    const editor = editorWithDraft('Exodus 99:5', { originalReference: 'Exodus 9:5' });
    try {
      confirmScriptureDraftView(editor.view, 2, { onInvalid: 'finalize' });
      expect(draftRanges(editor)).toHaveLength(0);
      let pillRef: string | null = null;
      editor.state.doc.descendants((n) => {
        const pill = n.marks.find((m) => m.type.name === 'scripturePill');
        if (pill) pillRef = pill.attrs.reference;
      });
      expect(pillRef).toBe('Exodus 9:5');
    } finally {
      editor.destroy();
    }
  });
});

describe('the guard end-to-end through the view (someProp), not just the pure rule', () => {
  /**
   * The first round shipped with only the pure decision function tested; the plugin path
   * (findDraftRange at the caret, the mark's inclusive:false end boundary, shake class,
   * toast) had never executed. These run the exact prop chain ProseMirror runs.
   */
  function typeAt(editor: Editor, pos: number, text: string): boolean {
    editor.commands.setTextSelection(pos);
    return Boolean(
      editor.view.someProp('handleTextInput', (f: any) => f(editor.view, pos, pos, text)),
    );
  }

  it('blocks a digit typed at the end boundary of an invalid draft', () => {
    const editor = editorWithDraft('Exodus 16:1315');
    try {
      const end = 1 + 'Exodus 16:1315'.length;
      expect(typeAt(editor, end, '9')).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it('blocks a space on desktop', () => {
    const editor = editorWithDraft('Exodus 16:1315');
    try {
      const end = 1 + 'Exodus 16:1315'.length;
      expect(typeAt(editor, end, ' ')).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it('lets the repair dash through at its position', () => {
    const editor = editorWithDraft('Exodus 16:1315');
    try {
      expect(typeAt(editor, 1 + 'Exodus 16:13'.length, '-')).toBe(false);
    } finally {
      editor.destroy();
    }
  });

  it('applies the shake class to the draft element when it blocks', () => {
    const editor = editorWithDraft('Exodus 16:1315');
    try {
      document.body.appendChild(editor.view.dom);
      const end = 1 + 'Exodus 16:1315'.length;
      typeAt(editor, end, '9');
      const el = editor.view.dom.querySelector('.scripture-pill-draft');
      expect(el?.classList.contains('scripture-pill-draft--shake')).toBe(true);
    } finally {
      editor.view.dom.remove();
      editor.destroy();
    }
  });

  it('never fires outside a draft', () => {
    const editor = new Editor({ extensions, content: '<p>plain text</p>' });
    try {
      expect(typeAt(editor, 3, 'x')).toBe(false);
    } finally {
      editor.destroy();
    }
  });
});
