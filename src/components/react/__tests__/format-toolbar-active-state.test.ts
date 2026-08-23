/**
 * Why the format toolbar listens to `transaction` and not to `update` + `selectionUpdate`.
 *
 * The reported symptom was a button that stayed lit after the mark was switched off. The cause
 * is a hole between TipTap's two loudest events: toggling a mark with a collapsed caret writes
 * *stored marks* — the marks the next typed character will carry — which changes neither the
 * document nor the selection, so neither event fires and the toolbar never re-reads.
 *
 * The first test proves the hole is real in the version we ship, so this stays honest if TipTap
 * ever closes it. The second locks our subscription, because a plausible-looking "cleanup" back
 * to the two named events would reintroduce the bug and look correct in review.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'text*', toDOM: () => ['p', 0] },
    text: {},
  },
  marks: { bold: { toDOM: () => ['strong', 0] } },
});

describe('a stored-marks-only transaction', () => {
  it('changes neither the doc nor the selection — the hole the old listeners fell into', () => {
    const state = EditorState.create({
      doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text('hello')])]),
    });
    const tr = state.tr.setStoredMarks([schema.marks.bold.create()]);

    // `update` is gated on docChanged; `selectionUpdate` on selectionSet. This transaction is
    // neither, yet it is exactly what pressing Bold at a caret produces.
    expect(tr.docChanged).toBe(false);
    expect(tr.selectionSet).toBe(false);
    expect(tr.storedMarksSet).toBe(true);
    expect(state.apply(tr).storedMarks?.length).toBe(1);
  });
});

describe('the toolbar subscription', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/react/TiptapEditor.tsx'),
    'utf8',
  );
  const effect = source.slice(
    source.indexOf('const updateActiveStates = () => {'),
    source.indexOf('const studyDockChromeActive ='),
  );

  it('listens on transaction', () => {
    expect(effect).toContain("editor.on('transaction', updateActiveStates)");
    expect(effect).toContain("editor.off('transaction', updateActiveStates)");
  });

  it('does not rely on update or selectionUpdate, which skip the case above', () => {
    expect(effect).not.toContain("editor.on('update', updateActiveStates)");
    expect(effect).not.toContain("editor.on('selectionUpdate', updateActiveStates)");
  });
});
