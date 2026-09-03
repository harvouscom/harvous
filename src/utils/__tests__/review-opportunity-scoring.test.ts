import { describe, it, expect } from 'vitest';
import {
  ENGINE_PER_KIND_CAP,
  NOTE_MEANING_WEIGHT_FLOOR,
  countCommittedSignals,
  engineDailyRoom,
  engineHasEnoughReady,
  nodeReadiness,
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
    /*
     * Ready by default, so these tests keep asking what they were written to ask — how nodes are
     * scored and picked, not whether they clear the gate. `nodeReadiness` has its own block.
     */
    exposureCount: 2,
    revisitCount: 1,
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

const noteNode = (id: string, overrides: Partial<ReviewCandidateNode> = {}) =>
  node({ nodeKind: 'note', nodeKey: nodeKey.note(id), noteId: id, ...overrides });

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
    const picked = selectReviewBatch(candidates, {
      now: NOW,
      existingSourceKeys: emptyKeys,
      // The note needs a fingerprint to clear the meaning floor; verses need none.
      meaningWeightByNoteId: new Map([['n1', 0.5]]),
    });
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

describe('nodeReadiness', () => {
  const ready = { exposureCount: 2, revisitCount: 1, firstStudiedAt: daysAgo(30) };

  it('turns away a node younger than a memory', () => {
    /*
     * The engine had no age gate: something touched once, twenty-five hours ago, and never
     * returned to was fully eligible — and since learning need is measured from `lastSeenAt`,
     * an abandoned node kept climbing the queue the longer it was ignored.
     */
    expect(nodeReadiness(verse('v', { ...ready, firstStudiedAt: daysAgo(2) }), NOW, null)).toBe('too-new');
    expect(nodeReadiness(verse('v', { ...ready, firstStudiedAt: daysAgo(3) }), NOW, null)).toBe('ready');
  });

  it('does not mistake opening a note often for doing something with it', () => {
    const seenALot = node({
      nodeKind: 'note',
      nodeKey: 'note:n1',
      noteId: 'n1',
      firstStudiedAt: daysAgo(30),
      exposureCount: 9,
      revisitCount: 0,
      expansionCount: 0,
      explicitConnectionCount: 0,
      synthesisCount: 0,
    });
    expect(nodeReadiness(seenALot, NOW, 0.5)).toBe('too-few-signals');
    // Two opens plus one deliberate act is two distinct signals, which is enough.
    expect(
      nodeReadiness(
        node({
          nodeKind: 'note',
          nodeKey: 'note:n1',
          noteId: 'n1',
          firstStudiedAt: daysAgo(30),
          exposureCount: 2,
          revisitCount: 0,
          expansionCount: 1,
        }),
        NOW,
        0.5,
      ),
    ).toBe('ready');
  });

  it('reads exposure differently for a passage than for a note', () => {
    /*
     * Checked against a real account, where it would otherwise have retired scripture review
     * entirely: of 51 verse nodes, 39 had no signal but exposure and none had two of anything.
     *
     * A note is exposed by being opened, which happens by accident. A verse node is only ever
     * touched by citing it in your own writing or marking it while reading — both of which the
     * writers record as `exposure` — so for a passage each one is already a deliberate act.
     * Passive reading lands on a `chapter` node, which Review never asks about.
     */
    const citedTwice = verse('v', {
      firstStudiedAt: daysAgo(30),
      exposureCount: 2,
      revisitCount: 0,
    });
    expect(countCommittedSignals(citedTwice)).toBe(2);
    expect(nodeReadiness(citedTwice, NOW, null)).toBe('ready');

    // Once is not a habit.
    const citedOnce = { ...citedTwice, exposureCount: 1 };
    expect(countCommittedSignals(citedOnce)).toBe(1);
    expect(nodeReadiness(citedOnce, NOW, null)).toBe('too-few-signals');

    // A note opened twice is one signal, not two — opening is not a deliberate act.
    const openedTwice = node({
      nodeKind: 'note',
      nodeKey: 'note:n1',
      noteId: 'n1',
      firstStudiedAt: daysAgo(30),
      exposureCount: 2,
      revisitCount: 0,
    });
    expect(countCommittedSignals(openedTwice)).toBe(1);
  });

  it('counts each kind of act once, never twice', () => {
    // A verse: exposure saturates at two however high it climbs, plus the revisit.
    expect(countCommittedSignals(verse('v', { exposureCount: 30, revisitCount: 12 }))).toBe(3);
    expect(
      countCommittedSignals(
        node({
          nodeKind: 'note',
          nodeKey: 'note:n1',
          exposureCount: 1,
          revisitCount: 1,
          expansionCount: 1,
          synthesisCount: 1,
        }),
      ),
    ).toBe(3);
  });

  it('never counts having been reviewed as a reason to review', () => {
    const reviewed = node({
      nodeKind: 'note',
      nodeKey: 'note:n1',
      noteId: 'n1',
      firstStudiedAt: daysAgo(30),
      exposureCount: 1,
      revisitCount: 0,
      reviewCount: 9,
    });
    expect(countCommittedSignals(reviewed)).toBe(0);
    expect(nodeReadiness(reviewed, NOW, 0.5)).toBe('too-few-signals');
  });

  it('holds a note to the meaning floor, and a verse to none', () => {
    const thin = node({ nodeKind: 'note', nodeKey: 'note:n1', noteId: 'n1', ...ready });
    expect(nodeReadiness(thin, NOW, 0.19)).toBe('too-thin');
    expect(nodeReadiness(thin, NOW, NOTE_MEANING_WEIGHT_FLOOR)).toBe('ready');
    // No fingerprint is not a pass.
    expect(nodeReadiness(thin, NOW, null)).toBe('too-thin');
    // A verse has no fingerprint and needs none: citing it is the deliberate act.
    expect(nodeReadiness(verse('v', ready), NOW, null)).toBe('ready');
  });
});

describe('engineHasEnoughReady', () => {
  const readyVerse = (key: string) =>
    verse(key, { exposureCount: 2, revisitCount: 1, firstStudiedAt: daysAgo(30) });

  it('holds the engine back until the account has been studied in', () => {
    const four = ['a', 'b', 'c', 'd'].map(readyVerse);
    expect(engineHasEnoughReady(four, NOW, new Map())).toBe(false);
    expect(engineHasEnoughReady([...four, readyVerse('e')], NOW, new Map())).toBe(true);
  });

  it('counts a node Review has already asked about', () => {
    // Already being in the queue still says this is an account someone studies in.
    const nodes = ['a', 'b', 'c', 'd', 'e'].map(readyVerse);
    expect(engineHasEnoughReady(nodes, NOW, new Map())).toBe(true);
  });

  it('does not count nodes that are not ready', () => {
    const newish = ['a', 'b', 'c', 'd', 'e'].map((k) =>
      verse(k, { exposureCount: 2, revisitCount: 1, firstStudiedAt: daysAgo(1) }),
    );
    expect(engineHasEnoughReady(newish, NOW, new Map())).toBe(false);
  });
});

describe('a tag the reader applied by hand', () => {
  it('counts as one signal on a note, however many tags there are', () => {
    /*
     * Filing a note under a tag is a deliberate act about that note — the readiness gate's whole
     * question. Three tags is still one decision to file it, so it does not buy three signals.
     */
    const filed = noteNode('n', { exposureCount: 0, revisitCount: 0, manualTagCount: 1 });
    expect(countCommittedSignals(filed)).toBe(1);
    expect(countCommittedSignals({ ...filed, manualTagCount: 3 })).toBe(1);
    expect(countCommittedSignals({ ...filed, manualTagCount: 0 })).toBe(0);
  });

  it('can be the signal that makes a note ready, alongside one other', () => {
    const opened = noteNode('n', {
      firstStudiedAt: daysAgo(30),
      exposureCount: 2,
      revisitCount: 0,
      manualTagCount: 0,
    });
    // A real meaning weight, since the thinness gate is a separate question from this one.
    expect(nodeReadiness(opened, NOW, 0.6)).toBe('too-few-signals');
    expect(nodeReadiness({ ...opened, manualTagCount: 2 }, NOW, 0.6)).toBe('ready');
  });

  it('says nothing about a passage, which has no tags of its own', () => {
    // Tags live on notes. A verse node carrying one would be a bug, not a signal.
    const cited = verse('v', { exposureCount: 1, revisitCount: 0, manualTagCount: 5 });
    expect(countCommittedSignals(cited)).toBe(1);
  });
});
