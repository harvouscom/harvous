import { describe, it, expect } from 'vitest';
import { buildVerseCloze, gradeVerseRebuild, verseClozeRatio, verseCue } from '../verse-cloze';

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

  it('strips the verse own quote marks, which the prompt supplies', () => {
    // Real text: many verses open mid-speech, and the prompt already wraps the cue in quotes.
    expect(verseCue('\u201cI am the vine; you are the branches.', 4)).toBe('I am the vine;');
    expect(verseCue('\u201cI am\u201d', 2)).toBe('I am');
  });

  it('is empty for empty text', () => {
    expect(verseCue('')).toBe('');
  });
});

describe('verseClozeRatio', () => {
  it('hides more each time a verse comes back round', () => {
    expect(verseClozeRatio(0)).toBeLessThan(verseClozeRatio(1));
    expect(verseClozeRatio(1)).toBeLessThan(verseClozeRatio(2));
  });

  it('stops rising, because writing it from memory is already a rung', () => {
    /*
     * `verse.recall` asks for the whole verse. A cloze that hides more than three content words
     * in five stops being a prompt and becomes that rung with extra steps.
     */
    expect(verseClozeRatio(3)).toBe(verseClozeRatio(2));
    expect(verseClozeRatio(99)).toBeLessThanOrEqual(0.6);
  });

  it('tolerates a nonsense pass', () => {
    expect(verseClozeRatio(-2)).toBe(verseClozeRatio(0));
    expect(verseClozeRatio(Number.NaN)).toBe(verseClozeRatio(0));
  });

  it('actually blanks more of a verse at a higher pass', () => {
    const text =
      'I am the vine you are the branches the one who remains in me and I in him bears much fruit because apart from me you can accomplish nothing';
    const low = buildVerseCloze(text, 'seed:1', verseClozeRatio(0));
    const high = buildVerseCloze(text, 'seed:2', verseClozeRatio(2));
    expect(high.blanks.length).toBeGreaterThan(low.blanks.length);
  });
});

describe('a blank never mangles the words around it', () => {
  it('leaves a hyphen-joined pair alone rather than eating the dash', () => {
    /*
     * Found by walking a later erosion pass, where more blanks meant a better chance of
     * hitting one. `me—and` is a single whitespace-delimited token holding two words; the
     * dash is stripped from the middle to give `meand`, which the token does not contain, and
     * the gap printed `_____nd`.
     */
    const text = 'The one who remains in me—and I in him—bears much fruit today always';
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const cloze = buildVerseCloze(text, seed, 0.6);
      expect(cloze.display).toContain('me—and');
      expect(cloze.display).not.toMatch(/_nd\b/);
    }
  });

  it('keeps punctuation on both sides of the gap', () => {
    const cloze = buildVerseCloze('“Rejoice always, pray continually, everywhere”', 'a', 0.6);
    expect(cloze.display.startsWith('“')).toBe(true);
    expect(cloze.display.trimEnd().endsWith('”')).toBe(true);
  });
});

describe('gradeVerseRebuild', () => {
  const cloze = buildVerseCloze(JOHN_15_5, 'seed:1', 0.3);

  it('accepts the missing words in the order they were taken out', () => {
    expect(gradeVerseRebuild(cloze, cloze.blanks.map((b) => b.word))).toBe(true);
  });

  it('does not care about case or punctuation', () => {
    /*
     * The question is whether the word was remembered, not how it was typed. A reader filling
     * gaps from memory should not be marked down for a capital or a missing apostrophe.
     */
    expect(
      gradeVerseRebuild(cloze, cloze.blanks.map((b) => ` ${b.word.toUpperCase()}, `)),
    ).toBe(true);
  });

  it('marks the right words in the wrong order wrong', () => {
    // Order is the exercise: "vine … branches" is not "branches … vine".
    const reversed = [...cloze.blanks.map((b) => b.word)].reverse();
    const distinct = new Set(reversed).size > 1;
    if (distinct) expect(gradeVerseRebuild(cloze, reversed)).toBe(false);
  });

  it('marks a short answer wrong rather than passing what was filled in', () => {
    expect(gradeVerseRebuild(cloze, cloze.blanks.slice(1).map((b) => b.word))).toBe(false);
    expect(gradeVerseRebuild(cloze, [])).toBe(false);
  });

  it('marks a verse with nothing blanked wrong rather than vacuously right', () => {
    expect(gradeVerseRebuild({ tokens: [], blanks: [], display: '' }, [])).toBe(false);
  });
});
