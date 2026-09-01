import { describe, it, expect } from 'vitest';
import { buildVerseCloze, verseCue } from '../verse-cloze';

const JOHN_15_5 =
  'I am the vine; you are the branches. Whoever abides in me and I in him, he it is that bears much fruit, for apart from me you can do nothing.';

describe('buildVerseCloze', () => {
  it('is deterministic for the same seed', () => {
    const a = buildVerseCloze(JOHN_15_5, 'review_1:1');
    const b = buildVerseCloze(JOHN_15_5, 'review_1:1');
    expect(a.blanks).toEqual(b.blanks);
    expect(a.display).toBe(b.display);
  });

  it('differs across seeds, so a later rung hides different words', () => {
    const first = buildVerseCloze(JOHN_15_5, 'review_1:1');
    const second = buildVerseCloze(JOHN_15_5, 'review_1:2');
    expect(first.blanks.map((b) => b.index)).not.toEqual(second.blanks.map((b) => b.index));
  });

  it('blanks roughly the requested share of the content words', () => {
    const cloze = buildVerseCloze(JOHN_15_5, 'seed', 0.3);
    // 9 content words in this verse, so ~3 blanks — not the 9 a share-of-all-tokens
    // target would have produced.
    expect(cloze.blanks.length).toBe(3);
  });

  it('always leaves content words standing to rebuild from', () => {
    for (const ratio of [0.3, 0.6, 0.9, 1]) {
      const cloze = buildVerseCloze(JOHN_15_5, 'seed', ratio);
      expect(cloze.blanks.length).toBeLessThanOrEqual(5);
    }
  });

  it('never blanks stopwords or short words', () => {
    const cloze = buildVerseCloze(JOHN_15_5, 'seed');
    for (const blank of cloze.blanks) {
      expect(blank.word.length).toBeGreaterThanOrEqual(4);
      expect(['the', 'and', 'you', 'from', 'that']).not.toContain(blank.word.toLowerCase());
    }
  });

  it('leaves the opening words alone so there is a way in', () => {
    const cloze = buildVerseCloze(JOHN_15_5, 'seed');
    expect(cloze.blanks.every((b) => b.index >= 2)).toBe(true);
  });

  it('keeps punctuation outside the gap', () => {
    const cloze = buildVerseCloze('I am the vine; you are the branches.', 'seed');
    expect(cloze.display).toMatch(/[;.]/);
    expect(cloze.display).toContain('_');
  });

  it('handles a verse with nothing eligible', () => {
    const cloze = buildVerseCloze('I am the and you', 'seed');
    expect(cloze.blanks).toEqual([]);
    expect(cloze.display).toBe('I am the and you');
  });

  it('handles empty text', () => {
    expect(buildVerseCloze('', 'seed')).toEqual({ tokens: [], blanks: [], display: '' });
  });

  it('always leaves at least one blank when something is eligible', () => {
    const cloze = buildVerseCloze('Jesus wept bitterly', 'seed', 0.01);
    expect(cloze.blanks.length).toBeGreaterThanOrEqual(1);
  });
});

describe('verseCue', () => {
  it('takes whole words from the start', () => {
    expect(verseCue(JOHN_15_5, 4)).toBe('I am the vine;');
  });

  it('is empty for empty text', () => {
    expect(verseCue('')).toBe('');
  });
});
