import { describe, expect, it } from 'vitest';
import { mergePassageTags, dominantBook, type PassageTagCandidate } from '../passage-aware-tags';
import type { AutoTagSuggestion } from '../auto-tag-generator';

const v = (book: string, chapter: number, verse: number) => ({ book, chapter, verse });

const prose = (keyword: string, confidence: number, category = 'spiritual'): AutoTagSuggestion => ({
  keyword,
  category,
  confidence,
  isExisting: false,
});

const theme = (keyword: string, relevance: number): PassageTagCandidate => ({ keyword, category: 'theme', relevance, kind: 'theme' });
const person = (keyword: string): PassageTagCandidate => ({ keyword, category: 'character', relevance: 1_000_000, kind: 'person' });
const place = (keyword: string): PassageTagCandidate => ({ keyword, category: 'place', relevance: 1_000_000, kind: 'place' });

describe('mergePassageTags', () => {
  it('boosts a prose tag corroborated by a passage theme', () => {
    const out = mergePassageTags([prose('Love', 0.7)], [theme('gods love', 5000)]);
    expect(out.find((s) => s.keyword === 'Love')!.confidence).toBeCloseTo(0.8);
  });

  it('ignores weak/incidental theme edges when boosting', () => {
    const out = mergePassageTags([prose('Life', 0.7)], [theme('the meaning of life', 10)]);
    expect(out.find((s) => s.keyword === 'Life')!.confidence).toBe(0.7); // relevance < 50 → no boost
  });

  it('adds net-new tags for referenced people and places', () => {
    const out = mergePassageTags([prose('Faith', 0.7)], [person('Moses'), place('Egypt')]);
    const keys = out.map((s) => s.keyword).sort();
    expect(keys).toEqual(['Egypt', 'Faith', 'Moses']);
    expect(out.find((s) => s.keyword === 'Moses')!.confidence).toBe(0.8);
    expect(out.find((s) => s.keyword === 'Egypt')!.category).toBe('place');
  });

  it('never auto-adds passage themes as net-new tags', () => {
    const out = mergePassageTags([prose('Faith', 0.7)], [theme('the meaning of life', 9000), theme('power of words', 4000)]);
    expect(out.map((s) => s.keyword)).toEqual(['Faith']);
  });

  it('does not duplicate an entity the note already tags (boosts instead)', () => {
    const out = mergePassageTags([prose('Moses', 0.7, 'character')], [person('Moses')]);
    expect(out.filter((s) => s.keyword === 'Moses')).toHaveLength(1);
    expect(out[0].confidence).toBeCloseTo(0.8);
  });

  it('respects excludeLabels, dismissed, and the net-new cap', () => {
    const candidates = [person('Moses'), person('Aaron'), place('Egypt'), place('Sinai')];
    const out = mergePassageTags([prose('Faith', 0.7)], candidates, {
      excludeLabels: ['Egypt'],
      dismissed: ['aaron'],
      maxNetNew: 1,
    });
    const added = out.filter((s) => s.keyword !== 'Faith').map((s) => s.keyword);
    expect(added).toEqual(['Moses']); // Egypt excluded, Aaron dismissed, cap = 1
  });
});

describe('dominantBook', () => {
  it('returns null for no passages', () => {
    expect(dominantBook([])).toBeNull();
  });

  it('picks the most-cited book', () => {
    expect(dominantBook([v('Romans', 8, 28), v('Romans', 8, 31), v('John', 3, 16)])).toBe('Romans');
  });

  it('breaks ties by canonical book order', () => {
    expect(dominantBook([v('John', 3, 16), v('Genesis', 1, 1)])).toBe('Genesis');
  });
});
