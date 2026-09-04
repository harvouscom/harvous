import { describe, it, expect } from 'vitest';
import { fillFraming, reviewFraming, type ReviewFramingFacts } from '@/utils/review-framing';

const NOW = new Date('2026-09-03T12:00:00Z');
const daysAgoIso = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const BASE: ReviewFramingFacts = {
  kind: 'verse',
  rungKey: 'verse.rebuild',
  identityIsAnswer: false,
  pass: 0,
  recallState: 'forming',
  revisitCount: 0,
  citedInNotes: 0,
  firstStudiedAt: null,
  topTheme: null,
  person: null,
  crossRefCount: 0,
  readerMarked: false,
};

const SEEDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

describe('reviewFraming', () => {
  it('says nothing rather than something generic', () => {
    expect(reviewFraming(BASE, 'a', NOW)).toBeNull();
  });

  it('prefers what the reader did over what the index says, and both over ladder state', () => {
    const everything: ReviewFramingFacts = {
      ...BASE,
      revisitCount: 3,
      citedInNotes: 3,
      readerMarked: true,
      firstStudiedAt: daysAgoIso(90),
      topTheme: 'adoption',
      person: 'Paul',
      crossRefCount: 12,
      pass: 2,
      recallState: 'durable',
    };
    for (const seed of SEEDS) {
      const spec = reviewFraming(everything, seed, NOW)!;
      expect(['returning', 'cited', 'marked', 'since']).toContain(spec.template);
    }
    const curatedOnly = { ...everything, revisitCount: 0, citedInNotes: 0, readerMarked: false, firstStudiedAt: daysAgoIso(40) };
    for (const seed of SEEDS) {
      expect(['themeSince', 'person', 'crossrefs']).toContain(reviewFraming(curatedOnly, seed, NOW)!.template);
    }
    const stateOnly = { ...BASE, pass: 1, recallState: 'durable' as const };
    for (const seed of SEEDS) {
      expect(['pass', 'holding']).toContain(reviewFraming(stateOnly, seed, NOW)!.template);
    }
  });

  it('varies within a group by seed, so a shelf of revisited verses is not one sentence repeated', () => {
    const facts = { ...BASE, revisitCount: 3, citedInNotes: 3, readerMarked: true };
    const seen = new Set(SEEDS.map((s) => reviewFraming(facts, s, NOW)!.template));
    expect(seen.size).toBeGreaterThan(1);
    // And the same seed always gives the same line.
    expect(reviewFraming(facts, 'a', NOW)).toEqual(reviewFraming(facts, 'a', NOW));
  });

  describe('never prints the answer under the question', () => {
    it('never names the theme on the theme rung', () => {
      const facts = { ...BASE, rungKey: 'verse.theme' as const, topTheme: 'adoption', firstStudiedAt: daysAgoIso(90) };
      for (const seed of SEEDS) {
        const spec = reviewFraming(facts, seed, NOW);
        expect(spec?.template).not.toBe('theme');
        expect(spec?.template).not.toBe('themeSince');
      }
    });

    it('never names the person on the person rung', () => {
      const facts = { ...BASE, rungKey: 'verse.person' as const, person: 'Paul' };
      expect(reviewFraming(facts, 'a', NOW)).toBeNull();
    });

    it('never counts cross-references on the cross-reference rung, nor on locate', () => {
      for (const rungKey of ['verse.crossref', 'verse.locate'] as const) {
        const facts = { ...BASE, rungKey, crossRefCount: 20 };
        expect(reviewFraming(facts, 'a', NOW)?.template).not.toBe('crossrefs');
      }
    });

    it('never counts citing notes on the rung that asks which note cites it', () => {
      const facts = { ...BASE, rungKey: 'verse.connect' as const, citedInNotes: 4 };
      expect(reviewFraming(facts, 'a', NOW)).toBeNull();
    });

    it('says nothing at all where the subject is the answer', () => {
      const facts = { ...BASE, identityIsAnswer: true, revisitCount: 9, topTheme: 'adoption' };
      expect(reviewFraming(facts, 'a', NOW)).toBeNull();
    });
  });

  it('holds its thresholds', () => {
    expect(reviewFraming({ ...BASE, revisitCount: 1 }, 'a', NOW)).toBeNull();
    expect(reviewFraming({ ...BASE, citedInNotes: 1 }, 'a', NOW)).toBeNull();
    expect(reviewFraming({ ...BASE, crossRefCount: 7 }, 'a', NOW)).toBeNull();
    // "Since" needs both age and at least one return; a passage cited once long ago is not a habit.
    expect(reviewFraming({ ...BASE, firstStudiedAt: daysAgoIso(90) }, 'a', NOW)).toBeNull();
    expect(reviewFraming({ ...BASE, firstStudiedAt: daysAgoIso(90), revisitCount: 1 }, 'a', NOW)?.template).toBe('since');
  });

  it('never frames a note with a person', () => {
    expect(reviewFraming({ ...BASE, kind: 'note', rungKey: 'note.passage', person: 'Paul' }, 'a', NOW)).toBeNull();
  });
});

describe('fillFraming', () => {
  it('renders the month in the reader own zone and drops the year when current', () => {
    const line = fillFraming({ template: 'since', args: { sinceIso: daysAgoIso(90) } }, NOW);
    expect(line.startsWith('In your study since ')).toBe(true);
    expect(line).toMatch(/June|May/);
    expect(line).not.toContain('2026');
    const old = fillFraming({ template: 'since', args: { sinceIso: '2024-03-10T00:00:00Z' } }, NOW);
    expect(old).toContain('2024');
  });

  it('renders every template as a sentence', () => {
    const specs = [
      { template: 'returning' as const, args: {} },
      { template: 'cited' as const, args: { n: 3 } },
      { template: 'marked' as const, args: {} },
      { template: 'themeSince' as const, args: { label: 'adoption', sinceIso: daysAgoIso(40) } },
      { template: 'theme' as const, args: { label: 'adoption' } },
      { template: 'person' as const, args: { label: 'Paul' } },
      { template: 'crossrefs' as const, args: { n: 12 } },
      { template: 'pass' as const, args: {} },
      { template: 'holding' as const, args: {} },
    ];
    for (const spec of specs) {
      const line = fillFraming(spec, NOW);
      expect(line.endsWith('.')).toBe(true);
      expect(line).not.toMatch(/undefined|null|\{/);
    }
  });
});

describe('a chapter', () => {
  const base = {
    identityIsAnswer: false,
    pass: 0,
    recallState: 'new' as const,
    revisitCount: 0,
    citedInNotes: 0,
    firstStudiedAt: null,
    topTheme: null,
    crossRefCount: 0,
    readerMarked: false,
  };

  it('can be framed by a person, but never on the rung that asks who appears', () => {
    const facts = { ...base, kind: 'chapter' as const, person: 'Nicodemus' };
    expect(reviewFraming({ ...facts, rungKey: 'chapter.verse' }, 's')).toEqual({
      template: 'person',
      args: { label: 'Nicodemus' },
    });
    expect(reviewFraming({ ...facts, rungKey: 'chapter.person' }, 's')).toBeNull();
  });
});
