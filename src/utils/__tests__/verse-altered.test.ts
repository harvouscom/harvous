import { describe, it, expect } from 'vitest';
import { alterationAllowed, buildVerseAltered, gradeVerseAltered } from '@/utils/verse-altered';

const JOHN_15 = [
  'Every branch that bears fruit he prunes so that it will bear more fruit.',
  'Remain in me, and I will remain in you.',
  'You are clean already because of the message that I have spoken to you.',
];

const SEEDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];

describe('the containments', () => {
  /*
   * These are the reason this rung exists in the form it does. Each one is a sentence the app
   * must never render, written out so that a change which starts rendering it fails here.
   */

  it('never removes or inserts a negation', () => {
    // "Whoever does not remain in me is thrown out" — drop the "not" and the verse says the
    // opposite of what it says.
    for (const word of ['not', 'no', 'never', 'none', 'neither', 'nor', 'without', 'cannot']) {
      expect(alterationAllowed(word)).toBe(false);
      expect(alterationAllowed(word.toUpperCase())).toBe(false);
    }
  });

  it('never touches a divine name or title', () => {
    for (const word of ['God', 'Lord', 'Jesus', 'Christ', 'Spirit', 'Father', 'Son', 'Holy', 'Lamb', 'King']) {
      expect(alterationAllowed(word)).toBe(false);
    }
  });

  it('never swaps one doctrinal term for another', () => {
    /*
     * The list a grammar-only guard would leave out. "The wages of sin is death" becoming "the
     * wages of grace is death" breaks no rule of syntax, and is exactly the sentence this rung
     * must not put on screen.
     */
    for (const word of ['sin', 'grace', 'faith', 'law', 'righteousness', 'blood', 'death', 'life', 'mercy', 'wrath', 'love']) {
      expect(alterationAllowed(word)).toBe(false);
    }
    /*
     * Asserted on the verse itself, not only on the word list. Romans 6:23 is almost entirely
     * weighty vocabulary; whatever this does with it, `sin`, `death`, `grace` and `life` must
     * all still be standing afterwards.
     */
    for (const seed of SEEDS) {
      const built = buildVerseAltered({
        text: 'For the wages of sin is death, but the free gift of God is eternal life.',
        candidateTexts: ['grace abounded through mercy and the covenant of love'],
        seed,
      });
      if (!built) continue;
      const line = built.tokens.join(' ').toLowerCase();
      for (const kept of ['sin', 'death', 'god', 'eternal', 'life']) {
        expect(line).toContain(kept);
      }
      expect(line).not.toContain('grace');
    }
  });

  it('never turns a promise into a possibility', () => {
    for (const word of ['shall', 'will', 'must', 'may', 'might', 'should']) {
      expect(alterationAllowed(word)).toBe(false);
    }
  });

  it('leaves numbers alone', () => {
    for (const word of ['three', 'forty', 'thousand', 'first', '40', '3']) {
      expect(alterationAllowed(word)).toBe(false);
    }
  });

  it('holds across many seeds on a real verse, not just as a word list', () => {
    /*
     * The rules above are only worth anything if the builder honours them. This asks for a dozen
     * different alterations of one verse and checks every one.
     */
    const text = 'I am the vine; you are the branches. The one who remains in me bears much fruit.';
    let built = 0;
    for (const seed of SEEDS) {
      const ex = buildVerseAltered({ text, candidateTexts: JOHN_15, seed });
      if (!ex) continue;
      built++;
      expect(alterationAllowed(ex.original)).toBe(true);
      expect(alterationAllowed(ex.substitute)).toBe(true);
      // Exactly one word differs, and it is the one the exercise names.
      const before = text.split(/\s+/);
      const differing = ex.tokens.map((t, i) => (t === before[i] ? -1 : i)).filter((i) => i >= 0);
      expect(differing).toEqual([ex.alteredIndex]);
    }
    expect(built).toBeGreaterThan(0);
  });
});

describe('buildVerseAltered', () => {
  const text = 'I am the vine; you are the branches. The one who remains in me bears much fruit.';

  it('changes exactly one word, keeping its punctuation', () => {
    const ex = buildVerseAltered({ text, candidateTexts: JOHN_15, seed: 'a' })!;
    expect(ex.tokens).toHaveLength(text.split(/\s+/).length);
    const changed = ex.tokens[ex.alteredIndex];
    const originalToken = text.split(/\s+/)[ex.alteredIndex];
    const punctuation = originalToken.replace(/[\p{L}\p{N}]/gu, '');
    expect(changed.replace(/[\p{L}\p{N}]/gu, '')).toBe(punctuation);
  });

  it('never puts in a word the verse already contains', () => {
    // Two identical words and the reader cannot say which one moved.
    for (const seed of SEEDS) {
      const ex = buildVerseAltered({ text, candidateTexts: JOHN_15, seed });
      if (!ex) continue;
      const before = text.toLowerCase();
      expect(before).not.toContain(ex.substitute.toLowerCase());
      // Nor a word that merely looks like one already there: `bear` beside `bears`.
      for (const word of before.split(/[^a-z]+/).filter((w) => w.length >= 4)) {
        expect(ex.substitute.toLowerCase().startsWith(word)).toBe(false);
        expect(word.startsWith(ex.substitute.toLowerCase())).toBe(false);
      }
    }
  });

  it('matches the capitalisation it replaces, so it cannot mint a proper noun', () => {
    const ex = buildVerseAltered({
      text: 'Peter answered the crowd about the message spoken among them',
      candidateTexts: ['a harvest gathered from every village nearby'],
      seed: 'c',
    });
    if (ex) {
      const before = 'Peter answered the crowd about the message spoken among them'.split(/\s+/);
      const wasCapital = /^\p{Lu}/u.test(before[ex.alteredIndex]);
      expect(/^\p{Lu}/u.test(ex.tokens[ex.alteredIndex])).toBe(wasCapital);
    }
  });

  it('is the same alteration for the same seed', () => {
    expect(buildVerseAltered({ text, candidateTexts: JOHN_15, seed: 'a' })).toEqual(
      buildVerseAltered({ text, candidateTexts: JOHN_15, seed: 'a' }),
    );
  });

  it('refuses rather than reaching for something it should not touch', () => {
    expect(buildVerseAltered({ text, candidateTexts: [], seed: 'a' })).toBeNull();
    expect(buildVerseAltered({ text: 'Jesus wept.', candidateTexts: JOHN_15, seed: 'a' })).toBeNull();
    expect(buildVerseAltered({ text: '', candidateTexts: JOHN_15, seed: 'a' })).toBeNull();
  });

  it('never swaps a dash-joined pair, which is two words wearing one token', () => {
    /*
     * `him—bears` passed every blocklist as the nonsense string `himbears` and was replaced
     * whole: the rung said "one word has been changed" having removed two, one of them a
     * reference to Christ. Found by reading a screenshot — the earlier version of this test
     * asserted only that `me—and` survived, which it did while its neighbour was eaten.
     */
    const text = 'The one who remains in me—and I in him—bears much fruit today';
    for (const seed of SEEDS) {
      const ex = buildVerseAltered({ text, candidateTexts: JOHN_15, seed });
      if (!ex) continue;
      const line = ex.tokens.join(' ');
      expect(line).toContain('me—and');
      expect(line).toContain('him—bears');
    }
  });
});

describe('gradeVerseAltered', () => {
  const ex = buildVerseAltered({
    text: 'I am the vine; you are the branches. The one who remains in me bears much fruit.',
    candidateTexts: JOHN_15,
    seed: 'a',
  })!;

  it('accepts the altered word and rejects every other', () => {
    expect(gradeVerseAltered(ex, ex.alteredIndex)).toBe(true);
    for (let i = 0; i < ex.tokens.length; i++) {
      if (i !== ex.alteredIndex) expect(gradeVerseAltered(ex, i)).toBe(false);
    }
  });

  it('rejects a nonsense index rather than throwing', () => {
    for (const bad of [-1, 1.5, Number.NaN, 9999]) {
      expect(gradeVerseAltered(ex, bad as number)).toBe(false);
    }
  });
});
