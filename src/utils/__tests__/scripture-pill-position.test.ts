import { describe, it, expect } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import {
  detectScriptureReferenceEndingAtCursor,
  findTextWithFlexibleMatching,
  findScriptureReferenceAtCursor,
  mapReferenceEndInSliceToDocPos,
} from '../scripture-pill-position';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
  marks: {},
});

function stateFromPlainText(text: string) {
  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, text ? [schema.text(text)] : []),
  ]);
  return EditorState.create({ doc });
}

describe('findTextWithFlexibleMatching', () => {
  it('matches en-dash in doc when search uses hyphen', () => {
    const matches = findTextWithFlexibleMatching('See Exodus 1:1–22 here', 'Exodus 1:1-22');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].length).toBe('Exodus 1:1–22'.length);
  });

  it('returns exact match when strings are identical', () => {
    const matches = findTextWithFlexibleMatching('Exodus 4:18-31', 'Exodus 4:18-31');
    expect(matches).toEqual([{ index: 0, length: 'Exodus 4:18-31'.length }]);
  });
});

describe('findScriptureReferenceAtCursor', () => {
  it('finds reference ending at cursor with en-dash in document', () => {
    const text = 'text Exodus 1:1–22';
    const state = stateFromPlainText(text);
    const cursorPos = 1 + text.length;
    const range = findScriptureReferenceAtCursor(state.doc, 'Exodus 1:1-22', cursorPos);
    expect(range).not.toBeNull();
    expect(state.doc.textBetween(range!.from, range!.to)).toBe('Exodus 1:1–22');
  });

  it('prefers match nearest cursor over earlier duplicate', () => {
    const text = 'John 3:16 and later John 3:16';
    const state = stateFromPlainText(text);
    const cursorPos = 1 + text.length;
    const range = findScriptureReferenceAtCursor(state.doc, 'John 3:16', cursorPos);
    expect(range).not.toBeNull();
    const matched = state.doc.textBetween(range!.from, range!.to);
    expect(matched).toBe('John 3:16');
    expect(range!.to).toBe(cursorPos);
  });
});

describe('detectScriptureReferenceEndingAtCursor', () => {
  it('returns Exodus 1:1-22 ending at cursor', () => {
    const text = 'Exodus 1:1-22';
    const state = stateFromPlainText(text);
    const cursorPos = 1 + text.length;
    const result = detectScriptureReferenceEndingAtCursor(state.doc, cursorPos);
    expect(result).not.toBeNull();
    expect(result!.reference).toBe('Exodus 1:1-22');
    expect(state.doc.textBetween(result!.from, result!.to)).toBe('Exodus 1:1-22');
    expect(result!.to).toBe(cursorPos);
  });

  it('picks cursor-ending ref with en-dash in document', () => {
    const text = 'See Exodus 1:1–22';
    const state = stateFromPlainText(text);
    const cursorPos = 1 + text.length;
    const result = detectScriptureReferenceEndingAtCursor(state.doc, cursorPos);
    expect(result).not.toBeNull();
    expect(state.doc.textBetween(result!.from, result!.to)).toBe('Exodus 1:1–22');
    expect(result!.reference.replace(/–/g, '-')).toBe('Exodus 1:1-22');
  });

  it('prefers the reference ending nearest the cursor', () => {
    const text = 'John 3:16 and John 3:16';
    const state = stateFromPlainText(text);
    const cursorPos = 1 + text.length;
    const result = detectScriptureReferenceEndingAtCursor(state.doc, cursorPos);
    expect(result).not.toBeNull();
    expect(result!.to).toBe(cursorPos);
  });
});

describe('mapReferenceEndInSliceToDocPos', () => {
  it('maps hyphen ref to en-dash doc text', () => {
    const text = 'text Exodus 1:1–22';
    const state = stateFromPlainText(text);
    const cursorPos = 1 + text.length;
    const range = mapReferenceEndInSliceToDocPos(state.doc, cursorPos, 'Exodus 1:1-22');
    expect(range).not.toBeNull();
    expect(state.doc.textBetween(range!.from, range!.to)).toBe('Exodus 1:1–22');
  });
});
