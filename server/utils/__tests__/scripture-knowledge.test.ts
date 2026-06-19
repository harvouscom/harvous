import { describe, expect, it } from 'vitest';
import { rankRelatedNotes, type RelatedSignal } from '../scripture-knowledge';

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
