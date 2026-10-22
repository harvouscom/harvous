import { describe, expect, it } from 'vitest';
import { excerptAroundMatch, queryMatchPattern, splitQueryMatches } from '../search-match-parts';

describe('splitQueryMatches', () => {
  it('marks every occurrence of each query word, case-insensitively', () => {
    expect(splitQueryMatches('Abide in me, and I abide in you', 'abide')).toEqual([
      { text: 'Abide', match: true },
      { text: ' in me, and I ', match: false },
      { text: 'abide', match: true },
      { text: ' in you', match: false },
    ]);
  });

  it('marks several words, preferring the longer where they overlap', () => {
    const parts = splitQueryMatches('the vine and the vineyard', 'vine vineyard');
    expect(parts.filter((p) => p.match).map((p) => p.text)).toEqual(['vine', 'vineyard']);
  });

  it('treats regex characters in the query as text', () => {
    expect(splitQueryMatches('John 3:16 (NET)', '3:16 (NET)').filter((p) => p.match)).toEqual([
      { text: '3:16', match: true },
      { text: '(NET)', match: true },
    ]);
  });

  it('ignores one-letter words and returns the text whole when nothing matches', () => {
    expect(queryMatchPattern('a')).toBeNull();
    expect(splitQueryMatches('a vine', 'a')).toEqual([{ text: 'a vine', match: false }]);
    expect(splitQueryMatches('a vine', 'olive')).toEqual([{ text: 'a vine', match: false }]);
  });
});

describe('excerptAroundMatch', () => {
  const body =
    'Pastor Ruth opened with the vineyards outside Jerusalem and how the old wood is cut back each winter. ' +
    'Pruning is not punishment. What would it look like to abide when the week is full? Who in our group needs this?';

  it('cuts a window that starts a little before the first match, with ellipses', () => {
    const excerpt = excerptAroundMatch(body, 'abide', 80);
    expect(excerpt).not.toBeNull();
    expect(excerpt!.startsWith('…')).toBe(true);
    expect(excerpt!.endsWith('…')).toBe(true);
    expect(excerpt).toContain('abide');
    /* Starts on a word boundary, not mid-word. */
    expect(excerpt!.slice(1, 2)).toMatch(/\S/);
    expect(body).toContain(excerpt!.slice(1, -1));
  });

  it('returns short text whole when the match is near the start', () => {
    expect(excerptAroundMatch('Abide in me.', 'abide')).toBe('Abide in me.');
  });

  it('answers null when no query word appears, so the caller keeps its own preview', () => {
    expect(excerptAroundMatch(body, 'olive')).toBeNull();
    expect(excerptAroundMatch('', 'abide')).toBeNull();
  });
});
