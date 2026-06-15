import { describe, it, expect } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import {
  detectScriptureReferenceEndingAtCursor,
  findTextWithFlexibleMatching,
  findScriptureReferenceAtCursor,
  mapReferenceEndInSliceToDocPos,
  shouldSchedulePassiveScriptureDetection,
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

function stateFromParagraphs(...lines: string[]) {
  const doc = schema.node(
    'doc',
    null,
    lines.map((t) => schema.node('paragraph', null, t ? [schema.text(t)] : [])),
  );
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

  it('detects ref ending at cursor when only whitespace follows in slice', () => {
    const text = 'Exodus 1:1-22 ';
    const state = stateFromPlainText(text);
    const cursorPos = 1 + text.length;
    const result = detectScriptureReferenceEndingAtCursor(state.doc, cursorPos);
    expect(result).not.toBeNull();
    expect(result!.reference).toBe('Exodus 1:1-22');
    expect(result!.from).not.toBeNull();
    expect(result!.to).not.toBeNull();
  });

  it('returns null when no reference ends at cursor', () => {
    const text = 'John 3:16 and Exodus 1:1-22';
    const state = stateFromPlainText(text);
    const cursorPos = 1 + 'John 3:16 and '.length;
    const result = detectScriptureReferenceEndingAtCursor(state.doc, cursorPos);
    expect(result).toBeNull();
  });

  it('returns Exodus 5 chapter-only ending at cursor', () => {
    const text = 'Lets talk about Exodus 5';
    const state = stateFromPlainText(text);
    const cursorPos = 1 + text.length;
    const result = detectScriptureReferenceEndingAtCursor(state.doc, cursorPos);
    expect(result).not.toBeNull();
    expect(result!.reference).toBe('Exodus 5');
    expect(state.doc.textBetween(result!.from!, result!.to!)).toBe('Exodus 5');
    expect(result!.to).toBe(cursorPos);
  });

  it('returns Exodus 5 chapter-only when trailing whitespace before cursor', () => {
    const text = 'Exodus 5 ';
    const state = stateFromPlainText(text);
    const cursorPos = 1 + text.length;
    const result = detectScriptureReferenceEndingAtCursor(state.doc, cursorPos);
    expect(result).not.toBeNull();
    expect(result!.reference).toBe('Exodus 5');
    expect(state.doc.textBetween(result!.from!, result!.to!)).toBe('Exodus 5');
  });

  it('detects a reference on a paragraph directly after prose ending in a word char', () => {
    // Regression: the detection slice must not glue the previous block's last char onto the
    // reference ("Ps Jared" + "Exodus 5" -> "JaredExodus 5"), which kills the leading \b.
    const state = stateFromParagraphs('Ps Jared', 'Exodus 5');
    const cursorPos = state.doc.content.size - 1; // end of "Exodus 5" in the second paragraph
    expect(state.doc.textBetween(cursorPos - 8, cursorPos)).toBe('Exodus 5');
    const result = detectScriptureReferenceEndingAtCursor(state.doc, cursorPos);
    expect(result).not.toBeNull();
    expect(result!.reference).toBe('Exodus 5');
    expect(state.doc.textBetween(result!.from!, result!.to!)).toBe('Exodus 5');
    expect(result!.to).toBe(cursorPos);
  });

  it('detects a verse reference on a paragraph after prose ending in a word char', () => {
    const state = stateFromParagraphs('Ps Jared', 'Exodus 5:6-9');
    const cursorPos = state.doc.content.size - 1;
    const result = detectScriptureReferenceEndingAtCursor(state.doc, cursorPos);
    expect(result).not.toBeNull();
    expect(result!.reference).toBe('Exodus 5:6-9');
    expect(state.doc.textBetween(result!.from!, result!.to!)).toBe('Exodus 5:6-9');
    expect(result!.to).toBe(cursorPos);
  });

  it('returns verse ref at cursor for Exodus 5:1, not chapter-only prefix', () => {
    const text = 'Exodus 5:1';
    const state = stateFromPlainText(text);
    const cursorPos = 1 + text.length;
    const result = detectScriptureReferenceEndingAtCursor(state.doc, cursorPos);
    expect(result).not.toBeNull();
    expect(result!.reference).toBe('Exodus 5:1');
    expect(state.doc.textBetween(result!.from!, result!.to!)).toBe('Exodus 5:1');
  });
});

describe('findScriptureReferenceAtCursor chapter-only prefix guard', () => {
  it('anchors Exodus 5 at cursor when verse ref appears earlier in text', () => {
    const text = 'Exodus 5:1 and later Exodus 5';
    const state = stateFromPlainText(text);
    const cursorPos = 1 + text.length;
    const range = findScriptureReferenceAtCursor(state.doc, 'Exodus 5', cursorPos);
    expect(range).not.toBeNull();
    expect(state.doc.textBetween(range!.from, range!.to)).toBe('Exodus 5');
    expect(range!.to).toBe(cursorPos);
  });
});

describe('shouldSchedulePassiveScriptureDetection', () => {
  it('does not schedule chapter-only mid-typing before verse (Exodus 5:1-2)', () => {
    const text = 'Exodus 5';
    const state = stateFromPlainText(text);
    const cursorPos = 1 + text.length;
    expect(shouldSchedulePassiveScriptureDetection(state.doc, cursorPos, false)).toBe(false);
  });

  it('schedules chapter-only at word boundary (Exodus 5 + space)', () => {
    const text = 'Exodus 5 ';
    const state = stateFromPlainText(text);
    const cursorPos = 1 + text.length;
    expect(shouldSchedulePassiveScriptureDetection(state.doc, cursorPos, true)).toBe(true);
  });

  it('schedules verse refs mid-typing (Exodus 5:1-2)', () => {
    const text = 'Exodus 5:1-2';
    const state = stateFromPlainText(text);
    const cursorPos = 1 + text.length;
    expect(shouldSchedulePassiveScriptureDetection(state.doc, cursorPos, false)).toBe(true);
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
