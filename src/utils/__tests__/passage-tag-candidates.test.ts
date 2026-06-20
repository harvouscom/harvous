import { describe, expect, it } from 'vitest';
import {
  normalizePlaceName,
  citedVerseKeys,
  passageCandidatesFromVerseKeys,
  passageCandidatesFromText,
  mergePassageTagSuggestions,
  type ClientPassageCandidate,
} from '../passage-tag-candidates';
import type { PassageKnowledgeMap } from '../passage-knowledge-cache';

const cache: PassageKnowledgeMap = {
  'Exodus|2|10': { people: ['Moses', 'Pharaoh'], places: [], themes: ['deliverance', 'adoption'] },
  'Matthew|2|1': { people: ['Herod'], places: ['Bethlehem 1', 'Jerusalem'], themes: ['worship'] },
};

describe('normalizePlaceName', () => {
  it('strips OpenBible disambiguation numbers', () => {
    expect(normalizePlaceName('Bethlehem 1')).toBe('Bethlehem');
    expect(normalizePlaceName('Damascus')).toBe('Damascus');
  });
});

describe('citedVerseKeys', () => {
  it('extracts canonical verse keys from text', () => {
    const keys = citedVerseKeys('Reflecting on Exodus 2:10 today');
    expect(keys).toContain('Exodus|2|10');
  });
});

describe('passageCandidatesFromVerseKeys', () => {
  it('returns people and places (not themes) by default', () => {
    const out = passageCandidatesFromVerseKeys(['Exodus|2|10', 'Matthew|2|1'], cache);
    expect(out.map((c) => c.keyword).sort()).toEqual(['Bethlehem', 'Herod', 'Jerusalem', 'Moses', 'Pharaoh']);
    expect(out.every((c) => c.kind !== 'theme')).toBe(true);
    expect(out.find((c) => c.keyword === 'Moses')!.category).toBe('character');
    expect(out.find((c) => c.keyword === 'Bethlehem')!.category).toBe('place'); // disambiguation stripped
  });

  it('includes themes when asked', () => {
    const out = passageCandidatesFromVerseKeys(['Exodus|2|10'], cache, { includeThemes: true });
    expect(out.some((c) => c.kind === 'theme' && c.keyword === 'deliverance')).toBe(true);
  });

  it('dedupes across verses and ignores uncited verses', () => {
    const out = passageCandidatesFromVerseKeys(['Exodus|2|10', 'Exodus|2|10', 'John|3|16'], cache);
    expect(out.filter((c) => c.keyword === 'Moses')).toHaveLength(1);
  });
});

describe('passageCandidatesFromText', () => {
  it('resolves candidates from cited references in text', () => {
    const out = passageCandidatesFromText('Studying Exodus 2:10', cache);
    expect(out.map((c) => c.keyword).sort()).toEqual(['Moses', 'Pharaoh']);
  });
});

describe('mergePassageTagSuggestions', () => {
  const person = (name: string): ClientPassageCandidate => ({ keyword: name, category: 'character', kind: 'person' });
  const place = (name: string): ClientPassageCandidate => ({ keyword: name, category: 'place', kind: 'place' });
  const theme = (name: string): ClientPassageCandidate => ({ keyword: name, category: 'theme', kind: 'theme' });

  it('adds people/places as net-new tags but never themes', () => {
    const out = mergePassageTagSuggestions(
      [{ name: 'Faith', category: 'spiritual', confidence: 0.75 }],
      [person('Moses'), place('Egypt'), theme('deliverance')],
    );
    expect(out.map((t) => t.name).sort()).toEqual(['Egypt', 'Faith', 'Moses']);
    expect(out.find((t) => t.name === 'Moses')!.confidence).toBe(0.8);
  });

  it('dedupes against existing tags and respects excludes + cap', () => {
    const out = mergePassageTagSuggestions(
      [{ name: 'Moses', category: 'character', confidence: 0.9 }],
      [person('Moses'), person('Aaron'), place('Egypt'), place('Sinai')],
      { excludeLabels: ['Egypt'], dismissed: ['aaron'], maxAdd: 1 },
    );
    const added = out.filter((t) => t.name !== 'Moses').map((t) => t.name);
    expect(added).toEqual(['Sinai']); // Moses dup, Egypt excluded, Aaron dismissed, cap 1
  });
});
