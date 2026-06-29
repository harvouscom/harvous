import { describe, expect, it } from 'vitest';
import { rankThreadSuggestions, scoreThreadKeywordOverlap } from '../thread-suggestion-ranking';

const meta = [
  { id: 'thread_a', title: 'Romans study', color: '#f00' },
  { id: 'thread_b', title: 'Grace notes', color: '#0f0' },
  { id: 'thread_c', title: 'Daily journal', color: null },
  { id: 'thread_unorganized', title: 'Unorganized', color: null },
];

describe('rankThreadSuggestions', () => {
  it('ranks knowledge (passage) above keyword and recent signals', () => {
    const noteIdToThreadIds = new Map([['note_1', ['thread_a']]]);
    const out = rankThreadSuggestions({
      relatedNotes: [
        { noteId: 'note_1', score: 6, sharedPassages: ['Romans|8|28'], sharedCrossRefs: [], sharedThemes: [], sameSection: false },
      ],
      noteIdToThreadIds,
      threadKeywordScores: new Map([['thread_b', 0.8]]),
      recentThreadIds: ['thread_c'],
      threadMeta: meta,
    });
    expect(out[0]?.threadId).toBe('thread_a');
    expect(out[0]?.reason).toBe('Shares a passage');
  });

  it('prefers cross-ref reason over theme when passages are empty', () => {
    const noteIdToThreadIds = new Map([['note_2', ['thread_b']]]);
    const out = rankThreadSuggestions({
      relatedNotes: [
        { noteId: 'note_2', score: 4, sharedPassages: [], sharedCrossRefs: ['Hebrews|11|17'], sharedThemes: ['topic_faith'] },
      ],
      noteIdToThreadIds,
      threadKeywordScores: new Map(),
      recentThreadIds: [],
      threadMeta: meta,
    });
    expect(out[0]?.reason).toBe('Cross-referenced passage');
  });

  it('uses keyword signal when no knowledge matches', () => {
    const out = rankThreadSuggestions({
      relatedNotes: [],
      noteIdToThreadIds: new Map(),
      threadKeywordScores: new Map([['thread_b', 1]]),
      recentThreadIds: [],
      threadMeta: meta,
    });
    expect(out[0]?.threadId).toBe('thread_b');
    expect(out[0]?.reason).toBe('Similar keywords');
  });

  it('falls back to recently used when no other signal', () => {
    const out = rankThreadSuggestions({
      relatedNotes: [],
      noteIdToThreadIds: new Map(),
      threadKeywordScores: new Map(),
      recentThreadIds: ['thread_c', 'thread_a'],
      threadMeta: meta,
    });
    expect(out[0]?.threadId).toBe('thread_c');
    expect(out[0]?.reason).toBe('Recently used');
  });

  it('excludes thread_unorganized', () => {
    const out = rankThreadSuggestions({
      relatedNotes: [],
      noteIdToThreadIds: new Map(),
      threadKeywordScores: new Map([['thread_unorganized', 1]]),
      recentThreadIds: ['thread_unorganized'],
      threadMeta: meta,
    });
    expect(out).toEqual([]);
  });

  it('takes max related-note score when multiple notes map to one thread', () => {
    const noteIdToThreadIds = new Map([
      ['note_1', ['thread_a']],
      ['note_2', ['thread_a']],
    ]);
    const out = rankThreadSuggestions({
      relatedNotes: [
        { noteId: 'note_1', score: 2, sharedPassages: ['John|3|16'], sharedCrossRefs: [], sharedThemes: [], sameSection: false },
        { noteId: 'note_2', score: 9, sharedPassages: [], sharedCrossRefs: [], sharedThemes: ['topic_love'] },
      ],
      noteIdToThreadIds,
      threadKeywordScores: new Map(),
      recentThreadIds: [],
      threadMeta: meta,
    });
    expect(out[0]?.score).toBeGreaterThanOrEqual(9);
    expect(out[0]?.reason).toBe('Shared theme');
  });

  it('respects limit and stable tiebreak on threadId', () => {
    const out = rankThreadSuggestions(
      {
        relatedNotes: [],
        noteIdToThreadIds: new Map(),
        threadKeywordScores: new Map([
          ['thread_a', 1],
          ['thread_b', 1],
        ]),
        recentThreadIds: [],
        threadMeta: meta,
      },
      { limit: 1 },
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.threadId).toBe('thread_a');
  });

  it('returns empty for no signals', () => {
    expect(
      rankThreadSuggestions({
        relatedNotes: [],
        noteIdToThreadIds: new Map(),
        threadKeywordScores: new Map(),
        recentThreadIds: [],
        threadMeta: meta,
      }),
    ).toEqual([]);
  });
});

describe('scoreThreadKeywordOverlap', () => {
  it('returns overlap ratio using conceptOverlaps', () => {
    const overlaps = (a: string, b: string) => a === 'grace' && b === 'mercy';
    const score = scoreThreadKeywordOverlap(
      ['grace', 'romans'],
      'Mercy thread',
      () => ['mercy'],
      overlaps,
    );
    expect(score).toBe(0.5);
  });
});
