import { describe, it, expect } from 'vitest';
import {
  NODE_KINDS,
  chapterKeyForVerse,
  nodeKey,
  parseNodeKey,
  reviewSourceKeyForNode,
  verseKeyPartsFromNodeKey,
  verseNodesForReference,
  verseReferenceLabel,
} from '@/utils/study-bible-nodes';
import { normalizeScriptureReference } from '@/utils/scripture-detector';

describe('node keys', () => {
  it('namespaces every kind so one column can hold all of them', () => {
    const keys = [
      nodeKey.note('note_1'),
      nodeKey.verse({ book: 'John', chapter: 15, verse: 5 }),
      nodeKey.chapter({ book: 'Romans', chapter: 8 }),
      nodeKey.theme('adoption'),
      nodeKey.person('paul'),
      nodeKey.place('corinth'),
      nodeKey.thread('note_rep'),
      nodeKey.connection('note_b', 'note_a'),
    ];
    for (const key of keys) {
      const parsed = parseNodeKey(key);
      expect(parsed).not.toBeNull();
      expect(NODE_KINDS).toContain(parsed!.kind);
    }
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('sorts a connection pair so a link made from either end is one node', () => {
    expect(nodeKey.connection('note_b', 'note_a')).toBe(nodeKey.connection('note_a', 'note_b'));
    expect(nodeKey.connection('note_a', 'note_b')).toBe('connection:note_a|note_b');
  });

  it('round-trips a verse key', () => {
    const parts = { book: '1 Corinthians', chapter: 13, verse: 4 };
    expect(verseKeyPartsFromNodeKey(nodeKey.verse(parts))).toEqual(parts);
  });

  it('rejects keys it did not build', () => {
    expect(parseNodeKey('note_1')).toBeNull();
    expect(parseNodeKey('unknown:thing')).toBeNull();
    expect(parseNodeKey('note:')).toBeNull();
    expect(verseKeyPartsFromNodeKey(nodeKey.note('note_1'))).toBeNull();
  });

  it('derives the chapter above a verse', () => {
    expect(chapterKeyForVerse({ book: 'John', chapter: 15, verse: 5 })).toBe('chapter:John|15');
  });
});

describe('verseNodesForReference', () => {
  it('expands a single verse and its chapter', () => {
    const result = verseNodesForReference('John 15:5');
    expect(result.verses).toEqual([{ book: 'John', chapter: 15, verse: 5 }]);
    expect(result.chapters).toEqual([{ book: 'John', chapter: 15 }]);
    expect(result.truncated).toBe(false);
  });

  it('expands a same-chapter range', () => {
    const result = verseNodesForReference('Romans 8:1-4');
    expect(result.verses.map((v) => v.verse)).toEqual([1, 2, 3, 4]);
    expect(result.chapters).toHaveLength(1);
  });

  it('spans chapters, which the plain verse-key helper cannot', () => {
    const result = verseNodesForReference('Exodus 6:28-7:7');
    const chapters = result.chapters.map((c) => c.chapter);
    expect(chapters).toContain(6);
    expect(chapters).toContain(7);
    expect(result.verses.some((v) => v.chapter === 7 && v.verse === 7)).toBe(true);
  });

  it('caps a long range rather than writing a row per verse of a psalm', () => {
    const result = verseNodesForReference('Psalm 119:1-40', { cap: 12 });
    expect(result.verses).toHaveLength(12);
    expect(result.truncated).toBe(true);
    // The chapter node still records the contact the capped verses would have.
    expect(result.chapters).toEqual([{ book: 'Psalms', chapter: 119 }]);
  });

  it('treats a whole-chapter reference as the chapter, not as marking every verse', () => {
    // normalizeScriptureReference expands "John 3" to "John 3:1-36", which would otherwise
    // look exactly like deliberately marking the first twelve verses once capped.
    const result = verseNodesForReference('John 3');
    expect(result.verses).toEqual([]);
    expect(result.chapters).toEqual([{ book: 'John', chapter: 3 }]);
    expect(result.truncated).toBe(false);
  });

  it('yields nothing for input that is not a reference', () => {
    expect(verseNodesForReference('').verses).toEqual([]);
    expect(verseNodesForReference('not a reference').verses).toEqual([]);
    expect(verseNodesForReference('').chapters).toEqual([]);
  });
});

describe('verseReferenceLabel', () => {
  it('matches what normalizeScriptureReference produces for a single verse', () => {
    for (const raw of ['John 15:5', '1 Corinthians 13:4', 'Psalm 23:1']) {
      const normalized = normalizeScriptureReference(raw);
      const { verses } = verseNodesForReference(raw);
      expect(verses).toHaveLength(1);
      expect(verseReferenceLabel(verses[0])).toBe(normalized);
    }
  });
});

describe('reviewSourceKeyForNode', () => {
  // These must equal what reviewSourceKey() in server/utils/review-service.ts produces, or
  // the engine would re-add a node that already has a review item in the queue.
  it('matches review-service for note, thread, verse and connection', () => {
    expect(
      reviewSourceKeyForNode({ nodeKind: 'note', nodeKey: nodeKey.note('note_1') }),
    ).toBe('note:note_1');
    expect(
      reviewSourceKeyForNode({ nodeKind: 'thread', nodeKey: nodeKey.thread('note_rep') }),
    ).toBe('thread:note_rep');
    expect(
      reviewSourceKeyForNode({
        nodeKind: 'verse',
        nodeKey: nodeKey.verse({ book: 'John', chapter: 15, verse: 5 }),
      }),
    ).toBe('verse:john 15:5');
    expect(
      reviewSourceKeyForNode({
        nodeKind: 'connection',
        nodeKey: nodeKey.connection('note_b', 'note_a'),
      }),
    ).toBe('connection:note_a:note_b');
  });

  it('returns null for kinds Review has no question for', () => {
    expect(reviewSourceKeyForNode({ nodeKind: 'theme', nodeKey: nodeKey.theme('adoption') })).toBeNull();
    expect(
      reviewSourceKeyForNode({ nodeKind: 'chapter', nodeKey: nodeKey.chapter({ book: 'Romans', chapter: 8 }) }),
    ).toBeNull();
    expect(reviewSourceKeyForNode({ nodeKind: 'person', nodeKey: nodeKey.person('paul') })).toBeNull();
  });
});
