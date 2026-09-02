import { describe, it, expect } from 'vitest';
import {
  ENGINE_PER_KIND_CAP,
  engineDailyRoom,
  intentScore,
  scoreNode,
  selectReviewBatch,
  type ReviewCandidateNode,
} from '@/utils/review-opportunity-scoring';
import { nodeKey } from '@/utils/study-bible-nodes';

const NOW = new Date('2026-09-01T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

function node(overrides: Partial<ReviewCandidateNode> & Pick<ReviewCandidateNode, 'nodeKind' | 'nodeKey'>): ReviewCandidateNode {
  return {
    label: null,
    noteId: null,
    secondaryNoteId: null,
    exposureCount: 1,
    revisitCount: 0,
    explicitConnectionCount: 0,
    expansionCount: 0,
    synthesisCount: 0,
    reviewCount: 0,
    firstStudiedAt: daysAgo(30),
    lastSeenAt: daysAgo(14),
    nextReviewAt: null,
    lastSignal: 'exposure',
    lastSourceLabel: 'Highlighted while reading John 15:5',
    lastSourceAt: daysAgo(14),
    status: 'active',
    meta: null,
    ...overrides,
  };
}

const verse = (key: string, overrides: Partial<ReviewCandidateNode> = {}) =>
  node({ nodeKind: 'verse', nodeKey: key, ...overrides });

const emptyKeys = new Set<string>();

describe('intentScore', () => {
  it('rises with what the reader did beyond looking', () => {
    const seen = node({ nodeKind: 'note', nodeKey: nodeKey.note('a'), noteId: 'a' });
    const worked = node({
      nodeKind: 'note',
      nodeKey: nodeKey.note('b'),
      noteId: 'b',
      revisitCount: 2,
      explicitConnectionCount: 1,
      expansionCount: 1,
    });
    expect(intentScore(worked)).toBeGreaterThan(intentScore(seen));
  });

  it('weights naming a Thread above returning to something', () => {
    const returned = node({ nodeKind: 'thread', nodeKey: nodeKey.thread('a'), revisitCount: 2 });
    const named = node({ nodeKind: 'thread', nodeKey: nodeKey.thread('b'), synthesisCount: 1 });
    expect(intentScore(named)).toBeGreaterThan(intentScore(returned));
  });

  it('saturates, so one heavily worked node cannot own the queue', () => {
    const enormous = node({
      nodeKind: 'note',
      nodeKey: nodeKey.note('a'),
      revisitCount: 50,
      synthesisCount: 20,
    });
    expect(intentScore(enormous)).toBe(1);
  });
});

describe('scoreNode', () => {
  it('refuses anything seen in the last day', () => {
    const fresh = verse(nodeKey.verse({ book: 'John', chapter: 15, verse: 5 }), {
      lastSeenAt: new Date(NOW.getTime() - 60 * 60 * 1000),
    });
    expect(scoreNode(fresh, NOW)).toBe(0);
  });

  it('refuses a node already scheduled by a review item', () => {
    const scheduled = verse(nodeKey.verse({ book: 'John', chapter: 15, verse: 5 }), {
      nextReviewAt: new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000),
    });
    expect(scoreNode(scheduled, NOW)).toBe(0);
  });

  it('refuses an archived node', () => {
    const archived = verse(nodeKey.verse({ book: 'John', chapter: 15, verse: 5 }), {
      status: 'archived',
    });
    expect(scoreNode(archived, NOW)).toBe(0);
  });

  it('compounds with activity: a recent source outranks an identical stale one', () => {
    const recent = verse(nodeKey.verse({ book: 'John', chapter: 15, verse: 5 }), {
      lastSourceAt: daysAgo(3),
    });
    const stale = verse(nodeKey.verse({ book: 'John', chapter: 15, verse: 6 }), {
      lastSourceAt: daysAgo(200),
    });
    expect(scoreNode(recent, NOW)).toBeGreaterThan(scoreNode(stale, NOW));
  });

  it('widens the window each time it has been reviewed', () => {
    const fresh = verse(nodeKey.verse({ book: 'John', chapter: 15, verse: 5 }));
    const drilled = verse(nodeKey.verse({ book: 'John', chapter: 15, verse: 6 }), {
      reviewCount: 4,
    });
    expect(scoreNode(drilled, NOW)).toBeLessThan(scoreNode(fresh, NOW));
  });
});

describe('selectReviewBatch', () => {
  it('mixes kinds rather than offering three of the same shape', () => {
    const candidates = [
      verse(nodeKey.verse({ book: 'John', chapter: 15, verse: 1 })),
      verse(nodeKey.verse({ book: 'John', chapter: 15, verse: 2 })),
      verse(nodeKey.verse({ book: 'John', chapter: 15, verse: 3 })),
      verse(nodeKey.verse({ book: 'John', chapter: 15, verse: 4 })),
      node({ nodeKind: 'note', nodeKey: nodeKey.note('n1'), noteId: 'n1' }),
    ];
    const picked = selectReviewBatch(candidates, { now: NOW, existingSourceKeys: emptyKeys });
    const verses = picked.filter((p) => p.nodeKind === 'verse');
    expect(picked).toHaveLength(3);
    expect(verses.length).toBeLessThanOrEqual(ENGINE_PER_KIND_CAP);
    expect(picked.some((p) => p.nodeKind === 'note')).toBe(true);
  });

  it('never re-adds something already in the queue, whatever its status', () => {
    const key = nodeKey.verse({ book: 'John', chapter: 15, verse: 5 });
    const picked = selectReviewBatch([verse(key)], {
      now: NOW,
      existingSourceKeys: new Set(['verse:john 15:5']),
    });
    expect(picked).toEqual([]);
  });

  it('skips node kinds Review has no question for', () => {
    const picked = selectReviewBatch(
      [
        node({ nodeKind: 'theme', nodeKey: nodeKey.theme('adoption') }),
        node({ nodeKind: 'chapter', nodeKey: nodeKey.chapter({ book: 'Romans', chapter: 8 }) }),
        node({ nodeKind: 'person', nodeKey: nodeKey.person('paul') }),
      ],
      { now: NOW, existingSourceKeys: emptyKeys },
    );
    expect(picked).toEqual([]);
  });

  it('respects the room it is given', () => {
    const candidates = [
      verse(nodeKey.verse({ book: 'John', chapter: 15, verse: 1 })),
      node({ nodeKind: 'note', nodeKey: nodeKey.note('n1'), noteId: 'n1' }),
      node({ nodeKind: 'thread', nodeKey: nodeKey.thread('t1'), noteId: 't1' }),
    ];
    expect(selectReviewBatch(candidates, { now: NOW, existingSourceKeys: emptyKeys, limit: 1 })).toHaveLength(1);
    expect(selectReviewBatch(candidates, { now: NOW, existingSourceKeys: emptyKeys, limit: 0 })).toEqual([]);
  });

  it('picks the same rows twice over the same data', () => {
    const candidates = [
      verse(nodeKey.verse({ book: 'John', chapter: 15, verse: 1 })),
      verse(nodeKey.verse({ book: 'John', chapter: 15, verse: 2 })),
      node({ nodeKind: 'note', nodeKey: nodeKey.note('n1'), noteId: 'n1' }),
      node({ nodeKind: 'note', nodeKey: nodeKey.note('n2'), noteId: 'n2' }),
    ];
    const first = selectReviewBatch(candidates, { now: NOW, existingSourceKeys: emptyKeys });
    const second = selectReviewBatch([...candidates].reverse(), { now: NOW, existingSourceKeys: emptyKeys });
    expect(first.map((n) => n.nodeKey)).toEqual(second.map((n) => n.nodeKey));
  });
});

describe('engineDailyRoom', () => {
  it('closes once the day is full', () => {
    expect(engineDailyRoom(0)).toBe(3);
    expect(engineDailyRoom(2)).toBe(1);
    expect(engineDailyRoom(3)).toBe(0);
    expect(engineDailyRoom(9)).toBe(0);
  });
});
