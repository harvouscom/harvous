import { describe, expect, it } from 'vitest';
import {
  escapeLikePattern,
  hasSearchableWord,
  parseVerseSearchParams,
  phraseForBoost,
  VERSE_SEARCH_DEFAULT_LIMIT,
  VERSE_SEARCH_MAX_LIMIT,
  verseReference,
} from '../scripture-verse-search';
import {
  plainVerseSnippet,
  splitVerseSnippet,
  VERSE_MATCH_END as E,
  VERSE_MATCH_START as S,
} from '@/utils/verse-search-snippet';

describe('parseVerseSearchParams', () => {
  it('normalises whitespace and defaults to NET', () => {
    expect(parseVerseSearchParams({ q: '  love   your enemies ' })).toEqual({
      ok: true,
      query: 'love your enemies',
      translation: 'NET',
      limit: VERSE_SEARCH_DEFAULT_LIMIT,
    });
  });

  it('accepts a translation in any case and caps the limit', () => {
    expect(parseVerseSearchParams({ q: 'redeem', translation: 'kjv', limit: '500' })).toMatchObject({
      ok: true,
      translation: 'KJV',
      limit: VERSE_SEARCH_MAX_LIMIT,
    });
  });

  it('refuses what cannot be a search', () => {
    expect(parseVerseSearchParams({ q: 'go' })).toMatchObject({ ok: false, code: 'QUERY_TOO_SHORT' });
    expect(parseVerseSearchParams({ q: 'x'.repeat(121) })).toMatchObject({ ok: false, code: 'QUERY_TOO_LONG' });
    expect(parseVerseSearchParams({ q: 'love', translation: 'XYZ' })).toMatchObject({
      ok: false,
      code: 'INVALID_TRANSLATION',
    });
  });
});

describe('hasSearchableWord', () => {
  it('is false for a query of nothing but stop words', () => {
    expect(hasSearchableWord('the')).toBe(false);
    expect(hasSearchableWord('and the')).toBe(false);
  });

  it('is true once any real word is present', () => {
    expect(hasSearchableWord('be not anxious')).toBe(true);
    expect(hasSearchableWord('there is love')).toBe(true);
  });
});

describe('phraseForBoost', () => {
  it('keeps the words a verse would contain, in order', () => {
    expect(phraseForBoost('"God so loved"')).toBe('God so loved');
    expect(phraseForBoost('love -hate or peace')).toBe('love peace');
  });
});

describe('escapeLikePattern', () => {
  it('makes wildcards literal', () => {
    expect(escapeLikePattern('100% _done_')).toBe('100\\% \\_done\\_');
  });
});

describe('verseReference', () => {
  it('reads the way the rest of the app writes references', () => {
    expect(verseReference('1 John', 4, 8)).toBe('1 John 4:8');
  });
});

describe('verse snippets', () => {
  it('splits marked words into runs, in order', () => {
    expect(splitVerseSnippet(`But ${S}love${E} your ${S}enemies${E}.`)).toEqual([
      { text: 'But ', match: false },
      { text: 'love', match: true },
      { text: ' your ', match: false },
      { text: 'enemies', match: true },
      { text: '.', match: false },
    ]);
  });

  it('draws back-to-back marks as one', () => {
    expect(splitVerseSnippet(`${S}God${E}${S}head${E} is`)).toEqual([
      { text: 'Godhead', match: true },
      { text: ' is', match: false },
    ]);
  });

  it('keeps the tail of a verse with an unclosed marker', () => {
    expect(splitVerseSnippet(`For ${S}God so loved`)).toEqual([
      { text: 'For ', match: false },
      { text: 'God so loved', match: true },
    ]);
  });

  it('reads as plain text without the markers', () => {
    expect(plainVerseSnippet(`${S}Jesus${E} wept.`)).toBe('Jesus wept.');
  });
});
