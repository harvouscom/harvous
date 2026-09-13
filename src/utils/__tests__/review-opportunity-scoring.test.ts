import { describe, it, expect } from 'vitest';
import {
  ENGINE_PER_KIND_CAP,
  ENGINE_PER_CHAPTER_CAP,
  ENGINE_PER_BOOK_CAP,
  NOTE_MEANING_WEIGHT_FLOOR,
  ENGINE_MIN_CHAPTER_AGE_DAYS,
  ENGINE_MIN_NODE_AGE_DAYS,
  ENGINE_NODE_KINDS,
  countCommittedSignals,
  engineDailyRoom,
  engineHasEnoughReady,
  nodeReadiness,
  intentScore,
  scoreNode,
  selectReviewBatch,
  describeEngineColdStart,
  type ReviewCandidateNode,
} from '@/utils/review-opportunity-scoring';
import { nodeKey } from '@/utils/study-bible-nodes';

const NOW = new Date('2026-09-01T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);

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
      verse(nodeKey.verse({ book: 'Romans', chapter: 8, verse: 1 })),
      verse(nodeKey.verse({ book: 'Psalms', chapter: 23, verse: 1 })),
      verse(nodeKey.verse({ book: 'Genesis', chapter: 1, verse: 1 })),
      node({ nodeKind: 'note', nodeKey: nodeKey.note('n1'), noteId: 'n1' }),
    ];
    const picked = selectReviewBatch(candidates, {
      now: NOW,
      existingSourceKeys: emptyKeys,
      // The note needs a fingerprint to clear the meaning floor; verses need none.
      meaningWeightByNoteId: new Map([['n1', 0.5]]),
    });
    const verses = picked.filter((p) => p.nodeKind === 'verse');
    expect(picked.length).toBeGreaterThanOrEqual(3);
    expect(picked.length).toBeLessThanOrEqual(5);
    expect(verses.length).toBeLessThanOrEqual(ENGINE_PER_KIND_CAP);
    expect(picked.some((p) => p.nodeKind === 'note')).toBe(true);
  });

  it('lets more than the cap of one kind through when over-fetching, which is why creation caps again', () => {
    // Five books, so neither the chapter nor the book cap is what stops anything here.
    const candidates = [
      verse(nodeKey.verse({ book: 'John', chapter: 15, verse: 1 })),
      verse(nodeKey.verse({ book: 'Romans', chapter: 8, verse: 1 })),
      verse(nodeKey.verse({ book: 'Psalms', chapter: 23, verse: 1 })),
      verse(nodeKey.verse({ book: 'Genesis', chapter: 1, verse: 1 })),
      verse(nodeKey.verse({ book: 'Isaiah', chapter: 40, verse: 31 })),
    ];
    const capped = selectReviewBatch(candidates, { now: NOW, existingSourceKeys: emptyKeys, limit: 15 });
    const overfetched = selectReviewBatch(candidates, {
      now: NOW,
      existingSourceKeys: emptyKeys,
      limit: 15,
      perKindCap: ENGINE_PER_KIND_CAP * 3,
    });
    expect(capped).toHaveLength(ENGINE_PER_KIND_CAP);
    expect(overfetched.length).toBeGreaterThan(ENGINE_PER_KIND_CAP);
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
      verse(nodeKey.verse({ book: 'Romans', chapter: 8, verse: 1 })),
      node({ nodeKind: 'note', nodeKey: nodeKey.note('n1'), noteId: 'n1' }),
      node({ nodeKind: 'note', nodeKey: nodeKey.note('n2'), noteId: 'n2' }),
    ];
    const first = selectReviewBatch(candidates, { now: NOW, existingSourceKeys: emptyKeys });
    const second = selectReviewBatch([...candidates].reverse(), { now: NOW, existingSourceKeys: emptyKeys });
    expect(first.map((n) => n.nodeKey)).toEqual(second.map((n) => n.nodeKey));
  });

  it('never offers two verses from the same chapter', () => {
    const candidates = [
      verse(nodeKey.verse({ book: 'John', chapter: 3, verse: 16 })),
      verse(nodeKey.verse({ book: 'John', chapter: 3, verse: 17 })),
      verse(nodeKey.verse({ book: 'John', chapter: 3, verse: 18 })),
      verse(nodeKey.verse({ book: 'Romans', chapter: 8, verse: 28 })),
    ];
    const picked = selectReviewBatch(candidates, { now: NOW, existingSourceKeys: emptyKeys });
    const john3 = picked.filter((p) => p.nodeKey.includes('John') && p.nodeKey.includes('|3|'));
    expect(john3).toHaveLength(ENGINE_PER_CHAPTER_CAP);
    expect(picked.some((p) => p.nodeKey === nodeKey.verse({ book: 'Romans', chapter: 8, verse: 28 }))).toBe(true);
  });

  it('does not pair a chapter with a verse from it', () => {
    const john3 = nodeKey.chapter({ book: 'John', chapter: 3 });
    const candidates = [
      node({
        nodeKind: 'chapter',
        nodeKey: john3,
        revisitCount: 2,
        exposureCount: 0,
        firstStudiedAt: daysAgo(10),
        lastSeenAt: daysAgo(3),
      }),
      verse(nodeKey.verse({ book: 'John', chapter: 3, verse: 16 })),
      verse(nodeKey.verse({ book: 'Romans', chapter: 8, verse: 28 })),
    ];
    const picked = selectReviewBatch(candidates, { now: NOW, existingSourceKeys: emptyKeys });
    const fromJohn3 = picked.filter(
      (p) => p.nodeKey === john3 || p.nodeKey === nodeKey.verse({ book: 'John', chapter: 3, verse: 16 }),
    );
    expect(fromJohn3).toHaveLength(1);
    expect(picked.some((p) => p.nodeKey === nodeKey.verse({ book: 'Romans', chapter: 8, verse: 28 }))).toBe(true);
  });

  it('caps a book at two passages', () => {
    const candidates = [
      verse(nodeKey.verse({ book: 'John', chapter: 1, verse: 1 })),
      verse(nodeKey.verse({ book: 'John', chapter: 3, verse: 16 })),
      verse(nodeKey.verse({ book: 'John', chapter: 15, verse: 5 })),
      verse(nodeKey.verse({ book: 'Romans', chapter: 8, verse: 28 })),
    ];
    const picked = selectReviewBatch(candidates, { now: NOW, existingSourceKeys: emptyKeys });
    const john = picked.filter((p) => p.nodeKey.startsWith('verse:John|') || p.nodeKey.startsWith('verse:john|'));
    // nodeKey.verse uses the book as given
    const johnActual = picked.filter((p) => p.nodeKey.includes('John'));
    expect(johnActual.length).toBeLessThanOrEqual(ENGINE_PER_BOOK_CAP);
    expect(picked.some((p) => p.nodeKey.includes('Romans'))).toBe(true);
  });
});

describe('engineDailyRoom', () => {
  it('closes once the day is full', () => {
    expect(engineDailyRoom(0)).toBe(5);
    expect(engineDailyRoom(2)).toBe(3);
    expect(engineDailyRoom(5)).toBe(0);
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
    /*
     * Nine opens is still one signal, and that is the idea this case was written for. It no
     * longer decides the note's readiness — a substantial note is ready on the strength of having
     * been written — so the claim is asserted where it is still load-bearing: `intentScore` reads
     * these counters to rank one ready note above another.
     */
    expect(countCommittedSignals(seenALot)).toBe(1);
    expect(
      countCommittedSignals(
        node({
          nodeKind: 'note',
          nodeKey: 'note:n1',
          noteId: 'n1',
          firstStudiedAt: daysAgo(30),
          exposureCount: 2,
          revisitCount: 0,
          expansionCount: 1,
        }),
      ),
    ).toBe(2);
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

    // Once is enough to enter — a second citation ranks it, it does not gate it.
    const citedOnce = { ...citedTwice, exposureCount: 1 };
    expect(countCommittedSignals(citedOnce)).toBe(1);
    expect(nodeReadiness(citedOnce, NOW, null)).toBe('ready');

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
    /*
     * Readiness is no longer where this is caught for a note — a substantial one is ready on the
     * strength of having been written. A note already on a schedule is kept out by `scoreNode`'s
     * `nextReviewAt` check and by `existingSourceKeys`, which is the right place for it: having
     * answered a question is a reason not to ask it *again yet*, not a reason to decide the study
     * was never worth asking about.
     */
    expect(nodeReadiness(reviewed, NOW, 0.5)).toBe('ready');
    expect(scoreNode({ ...reviewed, nextReviewAt: daysFromNow(4) }, NOW)).toBe(0);
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

  it('asks about a note you wrote and never went back to', () => {
    /*
     * The case the whole note rule exists for. One `exposure` and nothing else is what the save
     * path writes when someone writes a note and leaves it — no revisit, no link, no tag. Under
     * the old two-signal rule that was zero signals and the note was unaskable forever, which on
     * a real account made 30 of 31 substantial notes invisible to Review.
     *
     * Never returning to something is not evidence you would rather forget what is in it.
     */
    const written = noteNode('n', {
      firstStudiedAt: daysAgo(30),
      exposureCount: 1,
      revisitCount: 0,
      expansionCount: 0,
      explicitConnectionCount: 0,
      synthesisCount: 0,
      manualTagCount: 0,
    });
    expect(countCommittedSignals(written)).toBe(0);
    expect(nodeReadiness(written, NOW, NOTE_MEANING_WEIGHT_FLOOR)).toBe('ready');

    // The floor is the whole test, so it still turns a jotting away.
    expect(nodeReadiness(written, NOW, 0.19)).toBe('too-thin');
    expect(nodeReadiness(written, NOW, null)).toBe('too-thin');

    // And the age gate still holds — nothing written today is asked about today.
    expect(nodeReadiness({ ...written, firstStudiedAt: daysAgo(2) }, NOW, 0.5)).toBe('too-new');
  });

  it('widens notes and verses, not chapters from a glance', () => {
    /*
     * Dropping the two-signal gate for notes and verses must not drop it for a chapter whose
     * exposure is a glance. One glance at a chapter is not study, however many times it is repeated.
     */
    const once = { firstStudiedAt: daysAgo(30), exposureCount: 1, revisitCount: 0 };
    expect(nodeReadiness(verse('v', once), NOW, null)).toBe('ready');
    expect(
      nodeReadiness(
        node({ nodeKind: 'chapter', nodeKey: nodeKey.chapter({ book: 'John', chapter: 3 }), ...once, exposureCount: 50 }),
        NOW,
        null,
      ),
    ).toBe('too-few-signals');
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

  it('is still counted, though a note no longer needs it to be ready', () => {
    /*
     * This used to be the case that made a note ready — two signals, one of them the filing.
     * Readiness for a note is the meaning floor alone now, so the tag decides nothing here. The
     * count is still true and still feeds `intentScore`, which is what ranks one ready note above
     * another, so it is asserted on its own terms rather than deleted.
     */
    const opened = noteNode('n', {
      firstStudiedAt: daysAgo(30),
      exposureCount: 2,
      revisitCount: 0,
      manualTagCount: 0,
    });
    expect(nodeReadiness(opened, NOW, 0.6)).toBe('ready');
    expect(countCommittedSignals(opened)).toBe(1);
    expect(countCommittedSignals({ ...opened, manualTagCount: 2 })).toBe(2);
    // And the floor is still the thing that can turn a note away.
    expect(nodeReadiness({ ...opened, manualTagCount: 2 }, NOW, 0.1)).toBe('too-thin');
  });

  it('says nothing about a passage, which has no tags of its own', () => {
    // Tags live on notes. A verse node carrying one would be a bug, not a signal.
    const cited = verse('v', { exposureCount: 1, revisitCount: 0, manualTagCount: 5 });
    expect(countCommittedSignals(cited)).toBe(1);
  });
});

describe('a chapter the reader has been through', () => {
  /* `recordReadingEvent` writes `revisit` for a read or study dwell and `exposure` for a
     glance, so the passive half is already separated at the point of recording. */
  const chapter = (key: string, overrides: Partial<ReviewCandidateNode> = {}) =>
    node({
      nodeKind: 'chapter',
      nodeKey: key,
      exposureCount: 0,
      revisitCount: 0,
      firstStudiedAt: daysAgo(10),
      lastSeenAt: daysAgo(3),
      ...overrides,
    });
  const john3 = nodeKey.chapter({ book: 'John', chapter: 3 });

  it('is a kind the engine now considers', () => {
    expect(ENGINE_NODE_KINDS).toContain('chapter');
  });

  it('counts reads and never glances, however many', () => {
    expect(countCommittedSignals(chapter(john3, { revisitCount: 2 }))).toBe(2);
    expect(countCommittedSignals(chapter(john3, { exposureCount: 50 }))).toBe(0);
    // Capped, so a chapter read twenty times cannot outweigh the gate's intent.
    expect(countCommittedSignals(chapter(john3, { revisitCount: 20 }))).toBe(2);
  });

  it('counts a verse marked inside it as one more act', () => {
    const context = { highlightedChapterKeys: new Set([john3]) };
    expect(countCommittedSignals(chapter(john3, { revisitCount: 1 }), context)).toBe(2);
    // A mark in some other chapter says nothing about this one.
    expect(
      countCommittedSignals(chapter(john3, { revisitCount: 1 }), {
        highlightedChapterKeys: new Set([nodeKey.chapter({ book: 'Romans', chapter: 8 })]),
      }),
    ).toBe(1);
  });

  it('is ready after two reads and a day, and never on glances alone', () => {
    expect(nodeReadiness(chapter(john3, { revisitCount: 2 }), NOW, null)).toBe('ready');
    expect(nodeReadiness(chapter(john3, { exposureCount: 50 }), NOW, null)).toBe('too-few-signals');
    expect(
      nodeReadiness(chapter(john3, { revisitCount: 1 }), NOW, null, {
        highlightedChapterKeys: new Set([john3]),
      }),
    ).toBe('ready');
  });

  it('waits a day, which is shorter than a note or a verse waits', () => {
    const readToday = chapter(john3, { revisitCount: 2, firstStudiedAt: NOW });
    expect(nodeReadiness(readToday, NOW, null)).toBe('too-new');
    const yesterday = chapter(john3, {
      revisitCount: 2,
      firstStudiedAt: daysAgo(ENGINE_MIN_CHAPTER_AGE_DAYS),
    });
    expect(nodeReadiness(yesterday, NOW, null)).toBe('ready');
  });

  /*
   * This used to assert the opposite: "never unlocks the engine on its own", on the reasoning
   * that reading is the one signal arriving with no writing at all, and that five read chapters
   * would make a new reader's first week five chapter quizzes.
   *
   * The fear was right and the guard was in the wrong place. What it actually refused was the
   * reader it was written to protect — someone who had read eleven chapters and gone back to six
   * of them, studying by any honest reading of the word, and no closer to a feature that exists
   * to bring their study back. Reading is how a great many people study.
   *
   * The protection lives in `nodeReadiness`, which is where it belongs, and the pair below is
   * the whole argument: chapters that were read count, chapters that were merely opened do not.
   */
  it('unlocks the engine when the chapters were genuinely read', () => {
    const chapters = [1, 2, 3, 4, 5, 6, 7].map((n) =>
      chapter(nodeKey.chapter({ book: 'John', chapter: n }), { revisitCount: 2 }),
    );
    expect(engineHasEnoughReady(chapters, NOW, new Map())).toBe(true);
  });

  it('is not unlocked by chapters that were only opened', () => {
    /*
     * The case the old exclusion was really aimed at, and the one it never had to catch itself.
     * `countCommittedSignals` scores a glance at nothing: exposure however high is worth zero
     * for a chapter, so "turned to seven chapters" is seven nodes that are not ready.
     */
    const glanced = [1, 2, 3, 4, 5, 6, 7].map((n) =>
      chapter(nodeKey.chapter({ book: 'John', chapter: n }), { revisitCount: 0, exposureCount: 9 }),
    );
    expect(engineHasEnoughReady(glanced, NOW, new Map())).toBe(false);
  });

  it('counts a chapter that was read once and marked in', () => {
    // One read plus a highlight is two deliberate acts, the same bar a note or verse clears.
    const key = nodeKey.chapter({ book: 'John', chapter: 3 });
    const read = [1, 2, 3, 4, 5].map((n) =>
      chapter(nodeKey.chapter({ book: 'John', chapter: n }), { revisitCount: 1 }),
    );
    expect(engineHasEnoughReady(read, NOW, new Map())).toBe(false);
    const marked = read.map((c) => ({ ...c, nodeKey: key }));
    expect(
      engineHasEnoughReady(marked, NOW, new Map(), { highlightedChapterKeys: new Set([key]) }),
    ).toBe(true);
  });

  it('is picked once the account has cleared the gate on its own study', () => {
    const picked = selectReviewBatch([chapter(john3, { revisitCount: 2 })], {
      now: NOW,
      existingSourceKeys: emptyKeys,
    });
    expect(picked.map((n) => n.nodeKey)).toEqual([john3]);
  });
});

/**
 * What the cold start is waiting for, in terms a reader can be told.
 *
 * The gate can hold an account for days, and Review rendering nothing at all in the meantime is
 * indistinguishable from Review being broken — which is how it was reported, three times, by
 * someone who could see the feature existed and never saw a single item.
 *
 * The estimate has to be honest about which of the three holds applies. Only age resolves on its
 * own; too few committed signals and too thin a note both need the reader to do something, and a
 * date promised to someone whose study will still not qualify is worse than no date.
 */
describe('describeEngineColdStart', () => {
  const readyVerse = (key: string) =>
    verse(key, { exposureCount: 2, revisitCount: 1, firstStudiedAt: daysAgo(30) });
  /** Would qualify on every count except that it was studied today. */
  const newVerse = (key: string, ageDays: number) =>
    verse(key, { exposureCount: 2, revisitCount: 1, firstStudiedAt: daysAgo(ageDays) });

  it('reports how far off the gate is', () => {
    const state = describeEngineColdStart(['a', 'b'].map(readyVerse), NOW, new Map());
    expect(state.ready).toBe(2);
    expect(state.needed).toBe(5);
  });

  it('gives a date when waiting alone will open it', () => {
    // Two qualify now; three more were studied today and need to reach three days old.
    const nodes = [
      ...['a', 'b'].map(readyVerse),
      ...['c', 'd', 'e'].map((k) => newVerse(k, 0)),
    ];
    const state = describeEngineColdStart(nodes, NOW, new Map());
    expect(state.ready).toBe(2);
    expect(state.opensAt).toBeInstanceOf(Date);
    // The third of the young ones is the one that tips it, three days after it was studied.
    expect(state.opensAt!.getTime()).toBe(daysAgo(0).getTime() + 3 * 24 * 60 * 60 * 1000);
  });

  it('names the date the fifth node matures, not the last', () => {
    const nodes = [
      ...['a', 'b', 'c', 'd'].map(readyVerse),
      newVerse('e', 1),
      newVerse('f', 0),
    ];
    // Four are ready, so only one more is needed — the older of the two young ones.
    const state = describeEngineColdStart(nodes, NOW, new Map());
    expect(state.opensAt!.getTime()).toBe(daysAgo(1).getTime() + 3 * 24 * 60 * 60 * 1000);
  });

  it('gives no date when there is not enough study to mature', () => {
    // Three nodes in total can never reach five by waiting.
    const state = describeEngineColdStart(['a', 'b', 'c'].map((k) => newVerse(k, 0)), NOW, new Map());
    expect(state.opensAt).toBeNull();
  });

  it('gives no date for a node that will still not qualify once it is old enough', () => {
    // Studied today and never returned to — age is not the only thing holding it back, so its
    // third birthday changes nothing and promising that date would be a lie.
    const barren = ['a', 'b', 'c', 'd', 'e'].map((k) =>
      verse(k, { exposureCount: 0, revisitCount: 0, firstStudiedAt: daysAgo(0) }),
    );
    expect(describeEngineColdStart(barren, NOW, new Map()).opensAt).toBeNull();
  });

  it('counts read chapters, matching the gate it describes', () => {
    // Was asserted the other way, alongside the exclusion in `engineHasEnoughReady`. These two
    // have to agree about what a ready node is, or the estimate describes a different gate.
    const chapters = ['a', 'b', 'c', 'd', 'e'].map((k) =>
      node({ nodeKind: 'chapter', nodeKey: k, revisitCount: 2, firstStudiedAt: daysAgo(30) }),
    );
    const state = describeEngineColdStart(chapters, NOW, new Map());
    expect(state.ready).toBe(5);
    expect(engineHasEnoughReady(chapters, NOW, new Map())).toBe(true);
  });

  it('dates a chapter a day out, not three', () => {
    // Chapters mature on `ENGINE_MIN_CHAPTER_AGE_DAYS`. Using the note threshold here would put
    // the estimate two days behind the gate.
    const chapters = ['a', 'b', 'c', 'd', 'e'].map((k) =>
      node({ nodeKind: 'chapter', nodeKey: k, revisitCount: 2, firstStudiedAt: daysAgo(0) }),
    );
    const state = describeEngineColdStart(chapters, NOW, new Map());
    expect(state.opensAt!.getTime()).toBe(daysAgo(0).getTime() + ENGINE_MIN_CHAPTER_AGE_DAYS * 24 * 60 * 60 * 1000);
  });

  it('agrees with the gate about when the engine may run', () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map(readyVerse);
    expect(engineHasEnoughReady(five, NOW, new Map())).toBe(true);
    expect(describeEngineColdStart(five, NOW, new Map()).ready).toBeGreaterThanOrEqual(5);
  });

  it('counts written notes, matching the gate it describes', () => {
    /*
     * The same parity claim as the chapter case above, for the kind that just changed. These two
     * functions have to agree about what a ready node is; when they drifted this morning the
     * estimate described a gate that was not the one running, and Review left Home entirely.
     *
     * Five notes written and never returned to — nothing but the write touch on any of them.
     */
    const written = ['a', 'b', 'c', 'd', 'e'].map((k) =>
      noteNode(k, { exposureCount: 1, revisitCount: 0, firstStudiedAt: daysAgo(30) }),
    );
    const weights = new Map(written.map((n) => [n.noteId!, 0.5]));
    expect(describeEngineColdStart(written, NOW, weights).ready).toBe(5);
    expect(engineHasEnoughReady(written, NOW, weights)).toBe(true);
  });

  it('dates a written note that is only too new, and promises nothing for a thin one', () => {
    const young = ['a', 'b', 'c', 'd', 'e'].map((k) =>
      noteNode(k, { exposureCount: 1, revisitCount: 0, firstStudiedAt: daysAgo(0) }),
    );
    const substantial = new Map(young.map((n) => [n.noteId!, 0.5]));
    expect(describeEngineColdStart(young, NOW, substantial).opensAt!.getTime()).toBe(
      daysAgo(0).getTime() + ENGINE_MIN_NODE_AGE_DAYS * 24 * 60 * 60 * 1000,
    );

    // Thin notes never qualify by waiting, so no date is the honest answer.
    const thin = new Map(young.map((n) => [n.noteId!, 0.1]));
    expect(describeEngineColdStart(young, NOW, thin).opensAt).toBeNull();
  });
});
