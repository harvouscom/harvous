import { describe, expect, it } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { scripturePillSkipLeftTarget } from '../scripture-pill-range';
import { findAdjacentPillBoundaries } from '../scripture-pill-adjacent';

/**
 * Covers the `markName` parameter added to the pill boundary helpers so mention pills
 * reuse the same atomic-delete / arrow-skip logic as scripture pills, without disturbing
 * the default ('scripturePill') behavior exercised in scripture-pill-range.test.ts and
 * TiptapScripturePill.test.ts.
 */
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
  marks: {
    scripturePill: {
      attrs: { reference: {} },
      inclusive: false,
      toDOM: () => ['span', 0],
    },
    mentionPill: {
      attrs: { entityId: {} },
      inclusive: false,
      toDOM: () => ['span', 0],
    },
  },
});

function mentionPill(text: string) {
  return schema.text(text, [schema.marks.mentionPill.create({ entityId: text })]);
}

function docWithMentionPill(before: string, pillText: string, after: string) {
  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, [
      ...(before ? [schema.text(before)] : []),
      mentionPill(pillText),
      ...(after ? [schema.text(after)] : []),
    ]),
  ]);
  const pillFrom = 1 + before.length;
  const pillTo = pillFrom + pillText.length;
  return { doc, pillFrom, pillTo };
}

describe('scripturePillSkipLeftTarget with markName', () => {
  it('jumps before a mentionPill when markName is passed, and ignores it by default', () => {
    const { doc, pillFrom, pillTo } = docWithMentionPill('Not ', 'Romans Study', '');
    expect(scripturePillSkipLeftTarget(doc, pillTo, 'mentionPill')).toBe(pillFrom);
    // Default markName ('scripturePill') doesn't see a mentionPill mark — no target.
    expect(scripturePillSkipLeftTarget(doc, pillTo)).toBeNull();
  });
});

describe('findAdjacentPillBoundaries with markName', () => {
  it('finds a mentionPill immediately before the cursor when markName is passed', () => {
    const { doc, pillFrom, pillTo } = docWithMentionPill('see ', 'Romans Study', '');
    const boundaries = findAdjacentPillBoundaries(doc, pillTo, 'before', 'mentionPill');
    expect(boundaries).toEqual({ start: pillFrom, end: pillTo });
  });

  it('does not match a mentionPill under the default scripturePill markName', () => {
    const { doc, pillTo } = docWithMentionPill('see ', 'Romans Study', '');
    expect(findAdjacentPillBoundaries(doc, pillTo, 'before')).toBeNull();
  });

  it('finds a mentionPill immediately after the cursor when markName is passed', () => {
    const { doc, pillFrom, pillTo } = docWithMentionPill('', 'Romans Study', ' rest');
    const boundaries = findAdjacentPillBoundaries(doc, pillFrom, 'after', 'mentionPill');
    expect(boundaries).toEqual({ start: pillFrom, end: pillTo });
  });
});
