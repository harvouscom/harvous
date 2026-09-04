import { describe, it, expect } from 'vitest';
import { verseCue } from '@/utils/verse-cloze';
import {
  buildVerseLocate,
  buildVerseSequence,
  gradeVerseLocate,
  gradeVerseSequence,
  splitVersePhrases,
  buildVerseNext,
  gradeVerseNext,
  VERSE_NEXT_CUE_WORDS,
  buildVerseInitials,
  gradeVerseInitials,
  buildVerseKeywords,
  gradeVerseKeywords,
  buildVerseBefore,
  gradeVerseBefore,
  buildVerseBook,
  readerSpanFragment,
  READER_SPAN_MAX_WORDS,
  gradeVerseRecall,
  verseRecallCoverage,
  RECALL_MIN_SHARE,
  buildVerseRecognize,
} from '@/utils/verse-ladder-exercises';

const JOHN_15_5 =
  'I am the vine, you are the branches; the one who remains in me, and I in him, bears much fruit, because apart from me you can accomplish nothing.';

describe('splitVersePhrases', () => {
  it('cuts at the verse own punctuation rather than at a word count', () => {
    const phrases = splitVersePhrases(JOHN_15_5);
    expect(phrases.length).toBeGreaterThanOrEqual(3);
    expect(phrases[0]).toBe('I am the vine,');
    // Nothing is lost: the phrases still spell the verse.
    expect(phrases.join(' ').replace(/\s+/g, ' ')).toBe(JOHN_15_5);
  });

  it('never leaves a two-word fragment standing alone', () => {
    for (const phrase of splitVersePhrases('He wept, and, behold, the whole city came out.')) {
      expect(phrase.split(' ').filter(Boolean).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('falls back to word runs for a verse with no internal punctuation', () => {
    const phrases = splitVersePhrases('Jesus wept for his friend and for the people standing near him');
    expect(phrases.length).toBeGreaterThanOrEqual(3);
  });

  it('refuses a verse too short to make a puzzle of', () => {
    // Two words cannot become three phrases, and a puzzle of one chip is not one.
    expect(splitVersePhrases('Jesus wept.')).toEqual([]);
    expect(splitVersePhrases('')).toEqual([]);
  });
});

describe('buildVerseSequence', () => {
  it('is the same puzzle for the same seed on every device', () => {
    const a = buildVerseSequence(JOHN_15_5, 'review_1:5');
    const b = buildVerseSequence(JOHN_15_5, 'review_1:5');
    expect(a).toEqual(b);
  });

  it('differs between items', () => {
    const a = buildVerseSequence(JOHN_15_5, 'review_1:5');
    const b = buildVerseSequence(JOHN_15_5, 'review_2:5');
    expect(a?.phrases).not.toEqual(b?.phrases);
  });

  it('shows every phrase exactly once', () => {
    const exercise = buildVerseSequence(JOHN_15_5, 'review_1:5')!;
    const original = splitVersePhrases(JOHN_15_5);
    expect([...exercise.phrases].sort()).toEqual([...original].sort());
  });

  it('always leaves something to do', () => {
    // A shuffle that happened to change nothing would be a puzzle already solved.
    for (const seed of ['a:5', 'b:5', 'c:5', 'd:5', 'e:5']) {
      const exercise = buildVerseSequence(JOHN_15_5, seed)!;
      expect(exercise.order.every((position, index) => position === index)).toBe(false);
    }
  });

  it('returns null for a verse it cannot cut up', () => {
    expect(buildVerseSequence('Jesus wept.', 'review_1:5')).toBeNull();
  });
});

describe('gradeVerseSequence', () => {
  it('accepts the verse own order', () => {
    const exercise = buildVerseSequence(JOHN_15_5, 'review_1:5')!;
    expect(gradeVerseSequence(exercise, exercise.order)).toBe(true);
  });

  it('rejects two phrases swapped', () => {
    const exercise = buildVerseSequence(JOHN_15_5, 'review_1:5')!;
    const wrong = [...exercise.order];
    [wrong[0], wrong[1]] = [wrong[1], wrong[0]];
    expect(gradeVerseSequence(exercise, wrong)).toBe(false);
  });

  it('rejects a half-finished arrangement', () => {
    const exercise = buildVerseSequence(JOHN_15_5, 'review_1:5')!;
    expect(gradeVerseSequence(exercise, exercise.order.slice(0, 2))).toBe(false);
  });
});

describe('buildVerseLocate', () => {
  const pool = ['Romans 8:28', 'Ephesians 2:8', 'Colossians 1:17', '1 Peter 2:9'];

  it('offers four references, one of them right, each once', () => {
    const exercise = buildVerseLocate('John 15:5', JOHN_15_5, pool, 'review_1:6')!;
    expect(exercise.options).toHaveLength(4);
    expect(new Set(exercise.options).size).toBe(4);
    expect(exercise.options[exercise.answerIndex]).toBe('John 15:5');
  });

  it('draws distractors from the reader own passages before the canned ones', () => {
    const exercise = buildVerseLocate('John 15:5', JOHN_15_5, pool, 'review_1:6')!;
    const distractors = exercise.options.filter((option) => option !== 'John 15:5');
    expect(distractors.every((option) => pool.includes(option))).toBe(true);
  });

  it('falls back to well-known references when the reader has few of their own', () => {
    const exercise = buildVerseLocate('John 15:5', JOHN_15_5, [], 'review_1:6')!;
    expect(exercise.options).toHaveLength(4);
    expect(exercise.options).toContain('John 15:5');
  });

  it('never offers the answer twice, even when the pool contains it', () => {
    const exercise = buildVerseLocate('John 15:5', JOHN_15_5, ['John 15:5', ...pool], 'review_1:6')!;
    expect(exercise.options.filter((option) => option === 'John 15:5')).toHaveLength(1);
  });

  it('quotes a fragment from the middle, not the opening words', () => {
    const exercise = buildVerseLocate('John 15:5', JOHN_15_5, pool, 'review_1:6')!;
    expect(JOHN_15_5.startsWith(exercise.phrase)).toBe(false);
    expect(JOHN_15_5).toContain(exercise.phrase);
  });

  it('is the same puzzle for the same seed', () => {
    expect(buildVerseLocate('John 15:5', JOHN_15_5, pool, 'review_1:6')).toEqual(
      buildVerseLocate('John 15:5', JOHN_15_5, pool, 'review_1:6'),
    );
  });
});

describe('gradeVerseLocate', () => {
  const pool = ['Romans 8:28', 'Ephesians 2:8', 'Colossians 1:17', '1 Peter 2:9'];

  it('accepts the right reference and rejects the others', () => {
    const exercise = buildVerseLocate('John 15:5', JOHN_15_5, pool, 'review_1:6')!;
    expect(gradeVerseLocate(exercise, 'John 15:5')).toBe(true);
    for (const wrong of exercise.options.filter((option) => option !== 'John 15:5')) {
      expect(gradeVerseLocate(exercise, wrong)).toBe(false);
    }
  });

  it('does not care about surrounding whitespace or case', () => {
    const exercise = buildVerseLocate('John 15:5', JOHN_15_5, pool, 'review_1:6')!;
    expect(gradeVerseLocate(exercise, '  john 15:5 ')).toBe(true);
    expect(gradeVerseLocate(exercise, '')).toBe(false);
  });
});

describe('buildVerseNext', () => {
  const answerText = 'I am the vine; you are the branches. The one who remains in me bears much fruit.';
  const neighbours = [
    'Every branch that bears fruit he prunes so that it will bear more fruit.',
    'Remain in me, and I will remain in you.',
    'If anyone does not remain in me, he is thrown out like a branch and dries up.',
    'You are clean already because of the word that I have spoken to you.',
  ];

  it('offers four openings with the real continuation among them', () => {
    const ex = buildVerseNext({ answerText, neighbourTexts: neighbours, seed: 'a' })!;
    expect(ex.options).toHaveLength(4);
    expect(ex.options[ex.answerIndex]).toBe(verseCue(answerText, VERSE_NEXT_CUE_WORDS));
  });

  it('shows openings, not whole verses', () => {
    /*
     * Four full verses is a wall of text nobody reads, and length itself gives the answer away:
     * a long option can be reasoned about from its subject without remembering the passage.
     */
    const ex = buildVerseNext({ answerText, neighbourTexts: neighbours, seed: 'a' })!;
    for (const option of ex.options) {
      expect(option.split(/\s+/).length).toBeLessThanOrEqual(VERSE_NEXT_CUE_WORDS);
    }
  });

  it('is the same card for the same seed', () => {
    expect(buildVerseNext({ answerText, neighbourTexts: neighbours, seed: 'a' })).toEqual(
      buildVerseNext({ answerText, neighbourTexts: neighbours, seed: 'a' }),
    );
  });

  it('refuses rather than offering a thin question', () => {
    expect(buildVerseNext({ answerText, neighbourTexts: neighbours.slice(0, 1), seed: 'a' })).toBeNull();
    expect(buildVerseNext({ answerText: '', neighbourTexts: neighbours, seed: 'a' })).toBeNull();
  });

  it('marks the right pick right and every other one wrong', () => {
    const ex = buildVerseNext({ answerText, neighbourTexts: neighbours, seed: 'b' })!;
    const right = ex.options[ex.answerIndex];
    expect(gradeVerseNext(ex, right)).toBe(true);
    for (const wrong of ex.options.filter((o) => o !== right)) {
      expect(gradeVerseNext(ex, wrong)).toBe(false);
    }
  });

  it('rejects a right-looking answer that was never offered', () => {
    const ex = buildVerseNext({ answerText, neighbourTexts: neighbours, seed: 'b' })!;
    expect(gradeVerseNext(ex, 'Something the client made up')).toBe(false);
  });
});

describe('the text-keyed rungs', () => {
  const JOHN = 'I am the vine; you are the branches. The one who remains in me bears much fruit, because apart from me you can accomplish nothing.';

  describe('first letters', () => {
    it('keeps the first letter of every word and the punctuation around it', () => {
      const ex = buildVerseInitials(JOHN)!;
      expect(ex.initials.startsWith('I a t v; y a t b.')).toBe(true);
      expect(ex.wordCount).toBe(JOHN.split(/\s+/).length);
      // Never a whole word.
      for (const piece of ex.initials.split(/\s+/)) expect(piece.replace(/[^\p{L}]/gu, '').length).toBe(1);
    });

    it('accepts the verse written back, forgiving case, punctuation and a slipped connective', () => {
      expect(gradeVerseInitials(JOHN, JOHN)).toBe(true);
      expect(gradeVerseInitials(JOHN, JOHN.toUpperCase().replace(/[;,.]/g, ''))).toBe(true);
      // "a vine" for "the vine": the stopword is not the memory being tested.
      expect(gradeVerseInitials(JOHN, JOHN.replace('the vine', 'a vine'))).toBe(true);
    });

    it('rejects a content word missing or out of order', () => {
      expect(gradeVerseInitials(JOHN, JOHN.replace('branches', ''))).toBe(false);
      expect(gradeVerseInitials(JOHN, JOHN.replace('vine', 'branches').replace(/branches\./, 'vine.'))).toBe(false);
      expect(gradeVerseInitials(JOHN, '')).toBe(false);
    });

    it('refuses a verse too short to be an exercise', () => {
      expect(buildVerseInitials('Jesus wept.')).toBeNull();
    });
  });

  describe('key words', () => {
    it('asks for three, and accepts any three that are in the verse', () => {
      expect(buildVerseKeywords(JOHN)).toEqual({ count: 3 });
      expect(gradeVerseKeywords(JOHN, ['vine', 'branches', 'fruit'])).toBe(true);
      expect(gradeVerseKeywords(JOHN, ['FRUIT', 'remains', 'accomplish'])).toBe(true);
    });

    it('rejects a stopword, a repeat, or a word that is not there', () => {
      // "the" is in the verse and is not a memory of it.
      expect(gradeVerseKeywords(JOHN, ['the', 'vine', 'fruit'])).toBe(false);
      expect(gradeVerseKeywords(JOHN, ['vine', 'vine', 'fruit'])).toBe(false);
      expect(gradeVerseKeywords(JOHN, ['vine', 'fruit', 'olive'])).toBe(false);
      expect(gradeVerseKeywords(JOHN, ['vine', 'fruit'])).toBe(false);
    });

    it('refuses a verse with fewer than three words worth naming', () => {
      expect(buildVerseKeywords('Jesus wept and they saw it')).toBeNull();
    });
  });

  describe('which comes first', () => {
    const verse = { number: 5, text: JOHN };
    const other = { number: 8, text: 'My Father is honored by this, that you bear much fruit and become my disciples.' };

    it('offers two openings and knows which is earlier', () => {
      const ex = buildVerseBefore({ verse, other, seed: 'a' })!;
      expect(ex.options).toHaveLength(2);
      expect(ex.options[ex.answerIndex].startsWith('I am the vine')).toBe(true);
      expect(gradeVerseBefore(ex, ex.options[ex.answerIndex])).toBe(true);
      expect(gradeVerseBefore(ex, ex.options[1 - ex.answerIndex])).toBe(false);
    });

    it('never offers an adjacent verse, which is a question about a digit', () => {
      expect(buildVerseBefore({ verse, other: { number: 6, text: other.text }, seed: 'a' })).toBeNull();
      expect(buildVerseBefore({ verse, other: { number: 4, text: other.text }, seed: 'a' })).toBeNull();
    });

    it('shuffles by seed', () => {
      const orders = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((seed) => buildVerseBefore({ verse, other, seed })!.answerIndex));
      expect(orders.size).toBe(2);
    });
  });

  describe('the book', () => {
    it('offers the book among books the reader has cited, topping up from well-known ones', () => {
      const ex = buildVerseBook({ book: 'John', poolBooks: ['Romans', 'Psalms'], seed: 'a' })!;
      expect(ex.options).toHaveLength(4);
      expect(ex.options[ex.answerIndex]).toBe('John');
      expect(ex.options).toContain('Romans');
    });

    it('refuses with no book', () => {
      expect(buildVerseBook({ book: '', poolBooks: [], seed: 'a' })).toBeNull();
    });
  });
});

describe('readerSpanFragment', () => {
  const verse =
    'I am the vine; you are the branches. The one who remains in me and I in him bears much fruit.';

  it('takes a span the reader marked, when it is long enough and really in the verse', () => {
    expect(readerSpanFragment('the one who remains in me', verse)).toBe('the one who remains in me');
    // Case and spacing are the renderer's business, not the reader's.
    expect(readerSpanFragment('  I AM   the vine  ', verse)).toBe('I AM the vine');
  });

  it('refuses a bookmark', () => {
    // Real spans on the owner's account include "bribes" — a word, not a fragment to ask about.
    expect(readerSpanFragment('bribes', verse)).toBeNull();
    expect(readerSpanFragment('', verse)).toBeNull();
    expect(readerSpanFragment(null, verse)).toBeNull();
    expect(readerSpanFragment(undefined, verse)).toBeNull();
  });

  it('refuses a span this translation does not contain', () => {
    /*
     * A span is marked against whatever translation was on screen. Showing "abide in me" over a
     * NET verse that says "remains in me" would ask where a line is from that is not there.
     */
    expect(readerSpanFragment('he who abides in me', verse)).toBeNull();
  });

  it('cuts a long span down to a fragment', () => {
    const whole = readerSpanFragment(verse, verse);
    expect(whole).not.toBeNull();
    expect(whole!.split(' ')).toHaveLength(READER_SPAN_MAX_WORDS);
    expect(verse).toContain(whole!);
  });
});

describe('buildVerseLocate with a reader span', () => {
  const verse = 'I am the vine; you are the branches. The one who remains in me bears much fruit.';
  const pool = ['Romans 8:15', 'Psalm 23:1', 'Genesis 1:1', 'Ephesians 2:8'];

  it('shows the reader their own marked words rather than the middle of the verse', () => {
    const mine = buildVerseLocate('John 15:5', verse, pool, 'seed', 'you are the branches');
    expect(mine?.phrase).toBe('you are the branches');
    const theirs = buildVerseLocate('John 15:5', verse, pool, 'seed');
    expect(theirs?.phrase).not.toBe('you are the branches');
    // Same options either way: the span changes the question's stem, not its answer.
    expect(mine?.options).toEqual(theirs?.options);
    expect(mine?.answerIndex).toBe(theirs?.answerIndex);
  });
});

describe('marking a verse written from memory', () => {
  const verse =
    'I am the vine; you are the branches. The one who remains in me and I in him bears much fruit.';

  it('forgives case, punctuation and the small words', () => {
    expect(gradeVerseRecall(verse, 'i am the VINE you are the branches', 0.6)).toBe(false);
    // The content words that matter, all of them, however they were typed.
    expect(
      gradeVerseRecall(
        verse,
        'I AM THE VINE!!! you are the BRANCHES... the one who remains in me, and I in him, bears much fruit',
        0.6,
      ),
    ).toBe(true);
  });

  it('wants them in order, but not one after another', () => {
    /*
     * A paraphrase between the words of the verse costs nothing — the reader is producing the
     * verse, not transcribing it — but producing them backwards is not producing the verse.
     */
    expect(
      gradeVerseRecall(verse, 'the vine, and you my friends are the branches that remain in me and bear fruit', 0.5),
    ).toBe(true);
    expect(gradeVerseRecall(verse, 'fruit bears him remains branches vine', 0.5)).toBe(false);
  });

  it('measures how much of the verse was reached', () => {
    expect(verseRecallCoverage(verse, '')).toBe(0);
    expect(verseRecallCoverage(verse, verse)).toBe(1);
    const half = verseRecallCoverage(verse, 'I am the vine; you are the branches.');
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(1);
  });

  it('is a dial, and a stricter share wants more of the verse', () => {
    /*
     * Note how few content words a verse reduces to: this one has six, so the bar is "did you
     * reach the words that carry it". Half of them clears the recall floor and not a stricter
     * one — the share is a dial, and `RECALL_MIN_SHARE` is where it sits for the one rung that
     * asks the reader to produce the whole verse.
     */
    const half = 'I am the vine, you are the branches, and it bears';
    expect(verseRecallCoverage(verse, half)).toBeCloseTo(0.5, 2);
    expect(gradeVerseRecall(verse, half, RECALL_MIN_SHARE)).toBe(true);
    expect(gradeVerseRecall(verse, half, 0.6)).toBe(false);
  });

  it('never marks an empty answer right', () => {
    expect(gradeVerseRecall(verse, '   ', RECALL_MIN_SHARE)).toBe(false);
    expect(gradeVerseRecall('', 'anything', RECALL_MIN_SHARE)).toBe(false);
  });
});

describe('the recognition rung', () => {
  const verse = 'I am the vine; you are the branches. The one who remains in me bears much fruit.';
  const others = [
    'For this is the way God loved the world: He gave his one and only Son.',
    'The LORD is my shepherd, I lack nothing.',
    'In the beginning God created the heavens and the earth.',
    'Trust in the LORD with all your heart, and do not rely on your own understanding.',
  ];

  it('offers openings, never whole verses', () => {
    const exercise = buildVerseRecognize({ answerText: verse, poolTexts: others, seed: 's' });
    expect(exercise).not.toBeNull();
    // Eight words each: what the reader compares is beginnings, not paragraphs.
    for (const option of exercise!.options) {
      expect(option.split(/\s+/).length).toBeLessThanOrEqual(8);
    }
    expect(exercise!.options).toHaveLength(4);
  });

  it('has this verse as the answer, and never as a distractor', () => {
    const exercise = buildVerseRecognize({ answerText: verse, poolTexts: others, seed: 's' })!;
    const answer = exercise.options[exercise.answerIndex];
    expect(verse.startsWith(answer)).toBe(true);
    expect(exercise.options.filter((o) => verse.startsWith(o))).toHaveLength(1);
  });

  it('is the same question for the same seed, and marks the tap', () => {
    const a = buildVerseRecognize({ answerText: verse, poolTexts: others, seed: 'x' })!;
    const b = buildVerseRecognize({ answerText: verse, poolTexts: others, seed: 'x' })!;
    expect(a.options).toEqual(b.options);
    expect(gradeVerseNext(a, a.options[a.answerIndex])).toBe(true);
    expect(gradeVerseNext(a, a.options[(a.answerIndex + 1) % a.options.length])).toBe(false);
  });

  it('refuses to ask when there is nothing to choose between', () => {
    expect(buildVerseRecognize({ answerText: verse, poolTexts: [], seed: 's' })).toBeNull();
    expect(buildVerseRecognize({ answerText: '', poolTexts: others, seed: 's' })).toBeNull();
  });
});
