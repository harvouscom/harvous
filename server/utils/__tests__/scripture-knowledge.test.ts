import { describe, expect, it } from 'vitest';
import {
  rankRelatedNotes,
  mergeCrossReferences,
  relatedNoteReason,
  getPassageContext,
  type RelatedSignal,
  type CrossReference,
  type RelatedNote,
} from '../scripture-knowledge';

const cr = (
  book: string,
  verseStart: number,
  votes: number,
  verseEnd = verseStart,
): CrossReference => ({ book, chapterStart: 1, chapterEnd: 1, verseStart, verseEnd, votes });

describe('rankRelatedNotes', () => {
  it('weights shared passages above cross-refs above themes', () => {
    const signals: RelatedSignal[] = [
      { noteId: 'a', kind: 'passage', detail: 'John|3|16' },
      { noteId: 'b', kind: 'crossref', detail: 'Romans|5|8' },
      { noteId: 'c', kind: 'theme', detail: 'topic_love' },
    ];
    const ranked = rankRelatedNotes(signals);
    expect(ranked.map((r) => r.noteId)).toEqual(['a', 'b', 'c']);
    expect(ranked[0].score).toBe(3);
    expect(ranked[1].score).toBe(2);
    expect(ranked[2].score).toBe(1);
  });

  it('dedupes repeated signals and sums distinct ones', () => {
    const signals: RelatedSignal[] = [
      { noteId: 'a', kind: 'theme', detail: 'topic_love' },
      { noteId: 'a', kind: 'theme', detail: 'topic_love' }, // duplicate → counts once
      { noteId: 'a', kind: 'theme', detail: 'topic_grace' },
      { noteId: 'a', kind: 'passage', detail: 'John|3|16' },
    ];
    const [a] = rankRelatedNotes(signals);
    expect(a.sharedThemes.sort()).toEqual(['topic_grace', 'topic_love']);
    expect(a.sharedPassages).toEqual(['John|3|16']);
    expect(a.score).toBe(3 + 2 * 1); // one passage + two distinct themes
  });

  it('caps theme contribution so a passage match still wins', () => {
    const themeHeavy: RelatedSignal[] = Array.from({ length: 10 }, (_, i) => ({
      noteId: 'themes',
      kind: 'theme' as const,
      detail: `topic_${i}`,
    }));
    const onePassage: RelatedSignal[] = [{ noteId: 'passage', kind: 'passage', detail: 'John|3|16' }];
    const ranked = rankRelatedNotes([...themeHeavy, ...onePassage]);
    // 10 themes capped at 5 → score 5; but ordering is by score, so themes (5) > passage (3).
    expect(ranked[0].noteId).toBe('themes');
    expect(ranked[0].score).toBe(5);
  });

  it('breaks ties by noteId and respects the limit', () => {
    const signals: RelatedSignal[] = [
      { noteId: 'z', kind: 'passage', detail: 'p' },
      { noteId: 'a', kind: 'passage', detail: 'p' },
      { noteId: 'm', kind: 'passage', detail: 'p' },
    ];
    const ranked = rankRelatedNotes(signals, { limit: 2 });
    expect(ranked.map((r) => r.noteId)).toEqual(['a', 'm']);
  });

  it('returns nothing for empty input', () => {
    expect(rankRelatedNotes([])).toEqual([]);
  });
});

describe('mergeCrossReferences', () => {
  it('dedupes the same target across verses, keeping the highest votes', () => {
    // e.g. Romans 5:8 cross-referenced from two verses in the displayed range.
    const merged = mergeCrossReferences([cr('Romans', 8, 3), cr('Romans', 8, 7), cr('John', 16, 5)], 6);
    expect(merged).toHaveLength(2);
    const romans = merged.find((m) => m.book === 'Romans');
    expect(romans?.votes).toBe(7); // max of 3 and 7
  });

  it('sorts by votes descending and respects the cap', () => {
    const merged = mergeCrossReferences([cr('A', 1, 1), cr('B', 2, 9), cr('C', 3, 5)], 2);
    expect(merged.map((m) => m.book)).toEqual(['B', 'C']); // top 2 by votes
  });

  it('treats different verse spans of the same book as distinct targets', () => {
    const merged = mergeCrossReferences([cr('Acts', 2, 4, 2), cr('Acts', 2, 4, 5)], 6);
    expect(merged).toHaveLength(2); // 2:2 and 2:2-5 are different targets
  });
});

describe('relatedNoteReason', () => {
  const base: RelatedNote = { noteId: 'n', score: 0, sharedPassages: [], sharedCrossRefs: [], sharedThemes: [] };

  it('prioritizes passage > cross-ref > theme', () => {
    expect(relatedNoteReason({ ...base, sharedPassages: ['John|3|16'], sharedThemes: ['t'] })).toBe('Same passage');
    expect(relatedNoteReason({ ...base, sharedCrossRefs: ['Romans|5|8'], sharedThemes: ['t'] })).toBe('Cross-reference');
    expect(relatedNoteReason({ ...base, sharedThemes: ['topic_love'] })).toBe('Shared theme');
  });
});

describe('getPassageContext', () => {
  it('short-circuits to an empty context without touching the DB for no passages', async () => {
    const ctx = await getPassageContext('user_1', []);
    expect(ctx).toEqual({ themes: [], crossReferences: [], people: [], places: [], relatedNotes: [] });
  });
});
