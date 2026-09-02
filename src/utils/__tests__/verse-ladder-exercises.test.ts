import { describe, it, expect } from 'vitest';
import {
  buildVerseLocate,
  buildVerseSequence,
  gradeVerseLocate,
  gradeVerseSequence,
  splitVersePhrases,
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
