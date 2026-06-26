import { describe, expect, it } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { rangeContainsScripturePillMark, scripturePillSkipLeftTarget } from '../scripture-pill-range';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
  marks: {
    scripturePill: {
      attrs: { reference: {}, noteId: {}, translation: { default: null }, pillAccent: { default: null } },
      inclusive: false,
      toDOM: () => ['span', 0],
    },
  },
});

function pill(text: string) {
  return schema.text(text, [
    schema.marks.scripturePill.create({ reference: text, noteId: 'pending', translation: null }),
  ]);
}

/** [before][pill][after] in one paragraph; returns the doc + the pill's [from, to). */
function docWithPill(before: string, pillText: string, after: string) {
  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, [
      ...(before ? [schema.text(before)] : []),
      pill(pillText),
      ...(after ? [schema.text(after)] : []),
    ]),
  ]);
  // Paragraph opens at 0, text content starts at 1.
  const pillFrom = 1 + before.length;
  const pillTo = pillFrom + pillText.length;
  return { doc, pillFrom, pillTo };
}

describe('rangeContainsScripturePillMark', () => {
  it('detects a pill that overlaps the queried range', () => {
    const { doc, pillFrom, pillTo } = docWithPill('see ', 'John 3', ' today');
    expect(rangeContainsScripturePillMark(doc, pillFrom, pillTo)).toBe(true);
  });

  it('returns false for a plain-text range with no pill', () => {
    const { doc } = docWithPill('see ', 'John 3', ' today');
    // "today" sits after the pill — plain text only.
    expect(rangeContainsScripturePillMark(doc, doc.content.size - 3, doc.content.size - 1)).toBe(false);
  });

  it('guards the duplicate-chapter case: the existing pill range is flagged, a second plain instance is not', () => {
    // Existing "John 3" pill, then the user typed "John 3" again as plain text.
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        pill('John 3'),
        schema.text(' and John 3'),
      ]),
    ]);
    const firstPillFrom = 1;
    const firstPillTo = 1 + 'John 3'.length;
    // Scanning the existing pill's range => true, so the new-pill branch skips (no destruction).
    expect(rangeContainsScripturePillMark(doc, firstPillFrom, firstPillTo)).toBe(true);

    // The freshly typed second "John 3" (plain text near the end) => false, so a new pill is allowed.
    const secondFrom = doc.content.size - 'John 3'.length;
    const secondTo = doc.content.size;
    expect(rangeContainsScripturePillMark(doc, secondFrom, secondTo)).toBe(false);
  });

  it('clamps out-of-range / inverted positions without throwing', () => {
    const { doc } = docWithPill('', 'John 3', '');
    expect(rangeContainsScripturePillMark(doc, -10, 9999)).toBe(true);
    expect(rangeContainsScripturePillMark(doc, 5, 2)).toBe(false);
    expect(rangeContainsScripturePillMark(null, 0, 1)).toBe(false);
  });
});

describe('scripturePillSkipLeftTarget', () => {
  it('jumps before a pill flush against the caret (mid-text)', () => {
    const { doc, pillFrom, pillTo } = docWithPill('Not ', 'Genesis 1:1-2', '');
    // Caret immediately after the pill → target is the position before the pill.
    expect(scripturePillSkipLeftTarget(doc, pillTo)).toBe(pillFrom);
  });

  it('jumps before a pill at the very start of the block', () => {
    const { doc, pillTo } = docWithPill('', 'Genesis 1:1-2', '');
    expect(scripturePillSkipLeftTarget(doc, pillTo)).toBe(1);
  });

  it('crosses the pill in one step when the caret sits after a trailing spacer', () => {
    const { doc, pillFrom, pillTo } = docWithPill('Not ', 'Genesis 1:1-2', ' ');
    const afterSpace = pillTo + 1; // caret after the formatting spacer
    expect(scripturePillSkipLeftTarget(doc, afterSpace)).toBe(pillFrom);
    // And flush against the pill (between pill and spacer) also targets before the pill.
    expect(scripturePillSkipLeftTarget(doc, pillTo)).toBe(pillFrom);
  });

  it('returns null when no pill is immediately to the left', () => {
    const { doc } = docWithPill('Not ', 'Genesis 1:1-2', ' world');
    // Caret at the very end sits in " world" — no pill (or pill+space) to the left.
    expect(scripturePillSkipLeftTarget(doc, doc.content.size)).toBeNull();
    // Caret at the start of the doc — nothing to the left.
    expect(scripturePillSkipLeftTarget(doc, 0)).toBeNull();
  });
});
