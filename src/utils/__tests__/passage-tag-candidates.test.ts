import { describe, expect, it } from 'vitest';
import {
  normalizePlaceName,
  citedVerseKeys,
  passageCandidatesFromVerseKeys,
  passageCandidatesFromText,
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
