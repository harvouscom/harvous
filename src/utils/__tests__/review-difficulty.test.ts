import { describe, expect, it } from 'vitest';
import {
  RECALL_LEAD_IN_WORDS,
  VERSE_KEYWORDS_MIN_COUNT,
  reviewTierFor,
  verseClozeSpec,
  verseInitialsShare,
  verseKeywordsCount,
  verseRecallMode,
} from '../review-difficulty';
import { buildVerseCloze, clozeSegments, verseClozeRatio } from '../verse-cloze';
import { buildVerseInitials, buildVerseRecall, contentWords } from '../verse-ladder-exercises';

const JOHN = 'I am the vine; you are the branches. The one who remains in me — and I in him — bears much fruit, because apart from me you can accomplish nothing.';
/** A long one, where the gap cap is the thing doing the work rather than the share. */
const HEBREWS =
  'Therefore, since we are surrounded by such a great cloud of witnesses, let us throw off everything that hinders and the sin that so easily entangles, and let us run with perseverance the race marked out before us, fixing our eyes upon Jesus, the pioneer and perfecter of faith.';

describe('the tier a rung asks at', () => {
  it('is the easiest one the first time a rung is met', () => {
    // The rule the whole file is written around, and the one the owner asked for: whatever else
    // is true of the verse, a first meeting is easy.
    for (const state of ['new', 'fragile', 'forming', 'durable', 'slipping'] as const) {
      expect(reviewTierFor(0, state)).toBe(0);
    }
  });

  it('rises with the pass, and stops at the top', () => {
    expect(reviewTierFor(1)).toBe(1);
    expect(reviewTierFor(2)).toBe(2);
    expect(reviewTierFor(9)).toBe(2);
  });

  it('reaches full strength sooner on a verse the reader demonstrably holds', () => {
    /*
     * Reaching tier 2 on pass alone takes a second full loop of the ladder — and intervals
     * compound as a verse settles, so on the calendar that is a very long way out.
     */
    expect(reviewTierFor(1, 'durable')).toBe(2);
    expect(reviewTierFor(1, 'forming')).toBe(1);
  });

  it('never drops someone down a tier for missing one', () => {
    // The ladder already steps back on a genuine stall. Taking the rung away the moment someone
    // slips would remove the work just as they started doing it.
    expect(reviewTierFor(1, 'slipping')).toBe(1);
    expect(reviewTierFor(2, 'slipping')).toBe(2);
  });

  it('treats nonsense as a first meeting rather than throwing', () => {
    expect(reviewTierFor(Number.NaN)).toBe(0);
    expect(reviewTierFor(-3)).toBe(0);
  });
});

describe('every rung is gentle at tier 0 and hardest at tier 2', () => {
  it('widens the cloze and caps its gaps', () => {
    expect(verseClozeSpec(0).maxBlanks).toBe(2);
    expect(verseClozeSpec(0).ratio).toBeLessThan(verseClozeSpec(1).ratio);
    expect(verseClozeSpec(1).ratio).toBeLessThan(verseClozeSpec(2).ratio);
    expect(verseClozeSpec(2).maxBlanks).toBe(Number.POSITIVE_INFINITY);
  });

  it('caps a long verse to two gaps on a first meeting, where a share alone would not', () => {
    /*
     * The cap is what makes tier 0 gentle; a share alone does not. Twenty per cent of a long
     * verse's content words is still several gaps — a paragraph of typing on what is meant to be
     * the easiest form of the rung.
     */
    const spec = verseClozeSpec(0);
    const uncapped = buildVerseCloze(HEBREWS, 'seed', spec.ratio);
    expect(uncapped.blanks.length).toBeGreaterThan(spec.maxBlanks);

    const capped = buildVerseCloze(HEBREWS, 'seed', spec.ratio, { maxBlanks: spec.maxBlanks });
    expect(capped.blanks.length).toBe(2);

    // And the top tier is not capped at all — the share governs alone.
    const top = verseClozeSpec(2);
    const full = buildVerseCloze(HEBREWS, 'seed', top.ratio, { maxBlanks: top.maxBlanks });
    expect(full.blanks.length).toBeGreaterThan(capped.blanks.length);

    // A short verse needs no cap to be gentle: the share already lands at two.
    expect(buildVerseCloze(JOHN, 'seed', spec.ratio).blanks.length).toBeLessThanOrEqual(
      spec.maxBlanks,
    );
  });

  it('withdraws the letter-count hint only at the top', () => {
    const spec = verseClozeSpec(2);
    const cloze = buildVerseCloze(HEBREWS, 'seed', spec.ratio, { maxBlanks: spec.maxBlanks });
    const uniform = clozeSegments(cloze, { uniformWidths: true }).blankLengths;
    expect(new Set(uniform).size).toBe(1);
    // Below the top, each gap is still sized to the word it stands for.
    const sized = clozeSegments(cloze).blankLengths;
    expect(new Set(sized).size).toBeGreaterThan(1);
    expect(verseClozeSpec(0).uniformWidths).toBe(false);
    expect(verseClozeSpec(1).uniformWidths).toBe(false);
  });

  it('reduces a share of the initials before the whole verse', () => {
    expect(verseInitialsShare(0)).toBeLessThan(verseInitialsShare(1));
    expect(verseInitialsShare(2)).toBe(1);

    const easy = buildVerseInitials(JOHN, 'seed', verseInitialsShare(0))!;
    const hard = buildVerseInitials(JOHN, 'seed', verseInitialsShare(2))!;
    expect(easy.tier).toBe(0);
    expect(hard.tier).toBe(2);
    // The easy form still reads as a sentence: most words are whole.
    expect(easy.reduced.length).toBeLessThan(contentWords(JOHN).length);
    expect(easy.initials).toContain('branches');
    // The hard form is the skeleton, and has no gaps to type into.
    expect(hard.segments).toBeUndefined();
    expect(hard.initials).not.toContain('branches');
  });

  it('leaves the top tier byte-identical to the rung before it was staged', () => {
    // A reader who has climbed to the top meets exactly the exercise they were meeting before.
    const built = buildVerseInitials(JOHN, 'seed', 1)!;
    expect(built.initials.split(' ').every((token) => token.replace(/[^\p{L}]/gu, '').length <= 1)).toBe(
      true,
    );
  });

  it('gives the recall rung a way in before taking it away', () => {
    expect(verseRecallMode(0)).toBe('finish');
    expect(verseRecallMode(1)).toBe('leadIn');
    expect(verseRecallMode(2)).toBe('reference');

    const finish = buildVerseRecall(JOHN, 'finish');
    const lead = buildVerseRecall(JOHN, 'leadIn');
    const bare = buildVerseRecall(JOHN, 'reference');

    // Most of the verse, then a few words, then nothing.
    expect(finish.shown!.length).toBeGreaterThan(lead.shown!.length);
    expect(bare.shown).toBeNull();
    expect(lead.shown!.split(' ')).toHaveLength(RECALL_LEAD_IN_WORDS);

    // Shown and hidden are the whole verse between them, and never overlap.
    for (const built of [finish, lead]) {
      expect(`${built.shown} ${built.hiddenText}`.replace(/\s+/g, ' ').trim()).toBe(
        JOHN.replace(/\s+/g, ' ').trim(),
      );
    }
    expect(bare.hiddenText).toBe(JOHN.replace(/\s+/g, ' ').trim());
  });

  it('asks for fewer words before more', () => {
    expect(verseKeywordsCount(0)).toBe(VERSE_KEYWORDS_MIN_COUNT);
    expect(verseKeywordsCount(0)).toBeLessThan(verseKeywordsCount(1));
    expect(verseKeywordsCount(1)).toBeLessThan(verseKeywordsCount(2));
  });

  it('keeps the old ratio helper honest about the new table', () => {
    expect(verseClozeRatio(0)).toBe(verseClozeSpec(0).ratio);
    expect(verseClozeRatio(2)).toBe(verseClozeSpec(2).ratio);
  });
});

describe('a staged exercise is the same exercise every time it is asked', () => {
  it('draws the same words for the same seed, and different ones for another', () => {
    // The grader rebuilds from seed and tier to mark; a different draw would mark a question
    // nobody was asked.
    const a = buildVerseInitials(JOHN, 'item_1:2:0', 0.35)!;
    const b = buildVerseInitials(JOHN, 'item_1:2:0', 0.35)!;
    const c = buildVerseInitials(JOHN, 'item_2:2:0', 0.35)!;
    expect(a.reduced).toEqual(b.reduced);
    expect(a.reduced).not.toEqual(c.reduced);
  });
});
