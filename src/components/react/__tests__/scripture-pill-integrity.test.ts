import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import { UndoRedo } from '@tiptap/extensions';
import { TextSelection } from '@tiptap/pm/state';
import { ScripturePill, pillDeleteKeyForInputType } from '../TiptapScripturePill';

/**
 * "Make sure scripture pills don't break."
 *
 * The editor's own keys keep a pill's text valid. iOS goes around them — autocorrect, predictive
 * text and word-deletion replace text without a keydown — so these drive the document the way
 * those do (a raw transaction over pill text) and check the pill either survives intact or
 * steps down to plain words. A pill is never left showing text that is not its reference.
 */
const extensions = [Document, Paragraph, Text, Bold, UndoRedo.configure({ newGroupDelay: 0 }), ScripturePill];
let editor: Editor | null = null;

function make(html: string): Editor {
  editor = new Editor({ extensions, content: html });
  return editor;
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

const PILL = '<span data-scripture-reference="Exodus 32:1-35" data-scripture-translation="NLT">Exodus 32:1-35</span>';

/** [from, to] of each scripturePill run, with its text. */
function pills(ed: Editor): Array<{ from: number; to: number; text: string; reference: string }> {
  const out: Array<{ from: number; to: number; text: string; reference: string }> = [];
  ed.state.doc.descendants((node, pos) => {
    const mark = node.marks.find((m) => m.type.name === 'scripturePill');
    if (!node.isText || !mark) return;
    const last = out[out.length - 1];
    if (last && last.to === pos && last.reference === mark.attrs.reference) {
      last.to = pos + node.nodeSize;
      last.text += node.text;
    } else {
      out.push({ from: pos, to: pos + node.nodeSize, text: node.text ?? '', reference: mark.attrs.reference });
    }
  });
  return out;
}

function pillRange(ed: Editor) {
  const [p] = pills(ed);
  expect(p).toBeTruthy();
  return p!;
}

describe('pill integrity guard', () => {
  it('unwraps a pill whose text an autocorrect replacement made invalid, keeping the words', () => {
    const ed = make(`<p>Read ${PILL} today</p>`);
    const p = pillRange(ed);
    // iOS autocorrect swaps "Exodus" for "Excuse" in place — one replace step, no keydown.
    ed.view.dispatch(ed.state.tr.insertText('Excuse', p.from, p.from + 'Exodus'.length));
    expect(pills(ed)).toHaveLength(0);
    expect(ed.state.doc.textContent).toBe('Read Excuse 32:1-35 today');
  });

  it('unwraps a pill a word-delete cut in half', () => {
    const ed = make(`<p>${PILL}</p>`);
    const p = pillRange(ed);
    // deleteWordBackward from the end takes "-35": "Exodus 32:1" still resolves, but the pill
    // would open 32:1-35 while naming 32:1. A pill never says one passage and opens another.
    ed.view.dispatch(ed.state.tr.delete(p.to - 3, p.to));
    expect(pills(ed)).toHaveLength(0);
    expect(ed.state.doc.textContent).toBe('Exodus 32:1');
  });

  it('unwraps a pill cut down to nothing resolvable', () => {
    const ed = make(`<p>${PILL}</p>`);
    const p = pillRange(ed);
    ed.view.dispatch(ed.state.tr.delete(p.from + 'Exod'.length, p.to));
    expect(pills(ed)).toHaveLength(0);
    expect(ed.state.doc.textContent).toBe('Exod');
  });

  it('keeps a pill whose text changed to another spelling of the same reference', () => {
    const ed = make('<p><span data-scripture-reference="John 3:16">John 3:16</span></p>');
    const p = pillRange(ed);
    ed.view.dispatch(
      ed.state.tr.insertText('Jn', p.from, p.from + 'John'.length),
    );
    expect(pills(ed)).toEqual([expect.objectContaining({ text: 'Jn 3:16', reference: 'John 3:16' })]);
  });

  it('never judges a pill whose own text did not change, even if it disagrees with its reference', () => {
    // A legacy pill: shows the chapter, stores a narrower reference.
    const ed = make('<p><span data-scripture-reference="Acts 21:8">Acts 21</span> and</p>');
    const end = ed.state.doc.content.size - 1;
    ed.view.dispatch(ed.state.tr.insertText(' more', end));
    expect(pills(ed)).toHaveLength(1);
  });

  it('leaves untouched pills alone when text elsewhere changes', () => {
    const ed = make(`<p>${PILL} and more</p>`);
    const end = ed.state.doc.content.size - 1;
    ed.view.dispatch(ed.state.tr.insertText(' words', end));
    expect(pills(ed)).toEqual([expect.objectContaining({ text: 'Exodus 32:1-35', reference: 'Exodus 32:1-35' })]);
  });

  it('a partial pill unwrapped by the guard comes back whole on undo', () => {
    const ed = make(`<p>${PILL}</p>`);
    const p = pillRange(ed);
    ed.view.dispatch(ed.state.tr.delete(p.to - 3, p.to));
    expect(pills(ed)).toHaveLength(0);
    ed.commands.undo();
    expect(pills(ed)).toEqual([expect.objectContaining({ text: 'Exodus 32:1-35' })]);
  });
});

describe('pill editing invariants', () => {
  it('typing just before a pill lands as plain text and leaves the pill whole', () => {
    const ed = make(`<p>${PILL}</p>`);
    const p = pillRange(ed);
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, p.from)));
    ed.view.dispatch(ed.state.tr.insertText('See '));
    expect(ed.state.doc.textContent).toBe('See Exodus 32:1-35');
    expect(pills(ed)).toEqual([expect.objectContaining({ text: 'Exodus 32:1-35' })]);
  });

  it('bold over a selection that spans a pill never puts bold on the pill', () => {
    const ed = make(`<p>Read ${PILL} today</p>`);
    ed.commands.setTextSelection({ from: 1, to: ed.state.doc.content.size - 1 });
    ed.commands.toggleBold();
    const p = pillRange(ed);
    let pillHasBold = false;
    ed.state.doc.nodesBetween(p.from, p.to, (node) => {
      if (node.marks.some((m) => m.type.name === 'bold')) pillHasBold = true;
    });
    expect(pillHasBold).toBe(false);
    expect(pills(ed)).toHaveLength(1);
  });

  it('deleting a selection that covers part of a pill leaves no broken pill behind', () => {
    const ed = make(`<p>Read ${PILL} today</p>`);
    const p = pillRange(ed);
    ed.view.dispatch(ed.state.tr.delete(1, p.from + 'Exo'.length));
    expect(pills(ed)).toHaveLength(0);
    expect(ed.state.doc.textContent).toBe('dus 32:1-35 today');
  });

  it('copy/paste: a pill pasted as HTML is a pill again; one whose text names another passage is text', () => {
    const ed = make('<p>x</p>');
    ed.commands.insertContentAt(1, `<span data-scripture-reference="John 3:16">John 3:16</span>`);
    expect(pills(ed)).toEqual([expect.objectContaining({ reference: 'John 3:16' })]);
    ed.commands.insertContentAt(
      ed.state.doc.content.size - 1,
      ` <span data-scripture-reference="John 3:16">Romans 8:28</span>`,
    );
    expect(pills(ed)).toHaveLength(1);
    expect(ed.state.doc.textContent).toContain('Romans 8:28');
  });

  it('a pill at the end of the document keeps its mark when Enter splits after it', () => {
    const ed = make(`<p>${PILL}</p>`);
    ed.commands.setTextSelection(ed.state.doc.content.size - 1);
    ed.commands.splitBlock();
    ed.commands.insertContent('next');
    expect(pills(ed)).toEqual([expect.objectContaining({ text: 'Exodus 32:1-35' })]);
    expect(ed.state.doc.child(1).textContent).toBe('next');
  });
});

describe('pillDeleteKeyForInputType', () => {
  it('maps backward and forward deletes, and ignores everything else', () => {
    expect(pillDeleteKeyForInputType('deleteContentBackward')).toBe('Backspace');
    expect(pillDeleteKeyForInputType('deleteWordBackward')).toBe('Backspace');
    expect(pillDeleteKeyForInputType('deleteContentForward')).toBe('Delete');
    expect(pillDeleteKeyForInputType('insertText')).toBeNull();
    expect(pillDeleteKeyForInputType('insertReplacementText')).toBeNull();
  });
});
