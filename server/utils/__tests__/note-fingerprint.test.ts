import { describe, expect, it } from 'vitest';
import {
  computeMeaningWeight,
  buildNoteFingerprintData,
  htmlToVisibleText,
  type MeaningSignals,
} from '../note-fingerprint';

const baseSignals = (over: Partial<MeaningSignals> = {}): MeaningSignals => ({
  visibleTextLength: 0,
  passageCount: 0,
  highlightCount: 0,
  tagCount: 0,
  isPinned: false,
  deliberateOrg: false,
  hasConnections: false,
  ...over,
});

describe('computeMeaningWeight', () => {
  it('is 0 for an empty note and clamped within [0,1]', () => {
    const w = computeMeaningWeight(baseSignals());
    expect(w).toBe(0);
  });

  it('reaches 1 when every signal saturates', () => {
    const w = computeMeaningWeight(
      baseSignals({
        visibleTextLength: 1000,
        passageCount: 8,
        highlightCount: 6,
        tagCount: 10,
        isPinned: true,
        deliberateOrg: true,
        hasConnections: true,
      }),
    );
    expect(w).toBe(1);
  });

  it('ranks a deep, highlighted, organized note above a thin one (forgetting-aware ordering)', () => {
    const rich = computeMeaningWeight(
      baseSignals({ visibleTextLength: 600, passageCount: 3, highlightCount: 2, tagCount: 4, deliberateOrg: true }),
    );
    const thin = computeMeaningWeight(baseSignals({ visibleTextLength: 90 }));
    expect(rich).toBeGreaterThan(thin);
  });

  it('weights deliberate annotation (highlights) meaningfully', () => {
    const withHighlights = computeMeaningWeight(baseSignals({ highlightCount: 3 }));
    const without = computeMeaningWeight(baseSignals());
    expect(withHighlights - without).toBeCloseTo(0.2, 5);
  });
});

describe('buildNoteFingerprintData', () => {
  it('merges prose tags first, then passage themes, deduped case-insensitively', () => {
    const fp = buildNoteFingerprintData({
      proseTagNames: ['Faith', 'Grace'],
      passageThemes: ['grace', 'Covenant'],
      people: ['Moses', 'Moses'],
      places: ['Egypt'],
      passageCount: 2,
      passageBooks: ['Romans', 'Romans'],
      toneText: 'a note about trusting God',
      signals: baseSignals({ visibleTextLength: 120 }),
    });
    expect(fp.themes).toEqual(['Faith', 'Grace', 'Covenant']); // 'grace' deduped against 'Grace'
    expect(fp.people).toEqual(['Moses']);
    expect(fp.places).toEqual(['Egypt']);
    expect(fp.passageCount).toBe(2);
    expect(fp.canonSection).toBe('paul');
    expect(fp.testament).toBe('nt');
  });

  it('filters universal entities from themes and people', () => {
    const fp = buildNoteFingerprintData({
      proseTagNames: ['Jesus', 'Grace'],
      passageThemes: ['Christ'],
      people: ['Jesus', 'Peter'],
      places: ['Egypt'],
      passageCount: 1,
      passageBooks: ['Matthew'],
      toneText: 'reflecting on the gospels',
      signals: baseSignals({ visibleTextLength: 80 }),
    });
    expect(fp.themes).toEqual(['Grace']);
    expect(fp.people).toEqual(['Peter']);
  });

  it('leaves canon fields empty when there are no passage books', () => {
    const fp = buildNoteFingerprintData({
      proseTagNames: [],
      passageThemes: [],
      people: [],
      places: [],
      passageCount: 0,
      passageBooks: [],
      toneText: 'plain note',
      signals: baseSignals(),
    });
    expect(fp.canonSection).toBeNull();
    expect(fp.testament).toBeNull();
    expect(fp.canonSections).toEqual([]);
  });

  it('captures emotional tone from the assembled text', () => {
    const fp = buildNoteFingerprintData({
      proseTagNames: [],
      passageThemes: [],
      people: [],
      places: [],
      passageCount: 0,
      passageBooks: [],
      toneText: 'I am broken with grief and sorrow, weeping in anguish.',
      signals: baseSignals(),
    });
    expect(fp.emotionalTone).toBe('lament');
    expect(fp.toneScores.lament).toBeGreaterThan(0);
  });
});

describe('htmlToVisibleText', () => {
  it('strips tags and entities', () => {
    expect(htmlToVisibleText('<p>Hello&nbsp;<strong>world</strong></p>')).toBe('Hello world');
    expect(htmlToVisibleText(null)).toBe('');
  });
});
