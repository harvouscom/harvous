import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SAMPLE_EXERCISE,
  SAMPLE_EXERCISES,
  SAMPLE_FALLBACK_REFERENCES,
  availableSampleExercises,
  isSampleExercise,
  sampleExerciseSeed,
  buildSampleExercise,
  gradeSampleAnswer,
  pickSampleReference,
  sampleSeed,
} from '@/utils/review-sample';

const VERSE =
  'For this is the way God loved the world: He gave his one and only Son, so that everyone who believes in him will not perish but have eternal life.';

describe('pickSampleReference', () => {
  it('takes a passage of the reader own, and says so', () => {
    const picked = pickSampleReference({ ownReferences: ['John 15:5', 'Romans 8:15'], seed: 's' });
    expect(picked.source).toBe('yours');
    expect(['John 15:5', 'Romans 8:15']).toContain(picked.reference);
  });

  it('rotates the reader own passages too, rather than one verse forever', () => {
    /*
     * This took the *first* usable reference, so a reader with any passage at all met the
     * identical verse every morning with only the blanks moving — while the docblock promised
     * the opposite. The one question a free account is offered was the same question forever.
     */
    const own = ['John 15:5', 'Romans 8:15', 'Psalms 62:5', 'Ephesians 2:8'];
    const seen = new Set(
      ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06'].map(
        (day) => pickSampleReference({ ownReferences: own, seed: `sample:u:${day}` }).reference,
      ),
    );
    expect(seen.size).toBeGreaterThan(1);
  });

  it('is the same verse all day, so an answer answers the question on screen', () => {
    const own = ['John 15:5', 'Romans 8:15', 'Psalms 62:5'];
    const seed = 'sample:u:2026-09-04';
    expect(pickSampleReference({ ownReferences: own, seed })).toEqual(
      pickSampleReference({ ownReferences: own, seed }),
    );
  });

  it('ignores blank references rather than offering an empty question', () => {
    expect(pickSampleReference({ ownReferences: ['  ', ''], seed: 's' }).source).toBe('well-known');
  });

  it('falls back to a verse most people half-know, and says that too', () => {
    const picked = pickSampleReference({ ownReferences: [], seed: 'sample:u:2026-09-03' });
    expect(picked.source).toBe('well-known');
    expect(SAMPLE_FALLBACK_REFERENCES).toContain(picked.reference);
  });

  it('rotates the fallback by the day rather than showing one verse forever', () => {
    const seen = new Set(
      ['01', '02', '03', '04', '05', '06'].map(
        (d) => pickSampleReference({ ownReferences: [], seed: sampleSeed('u', `2026-09-${d}`) }).reference,
      ),
    );
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('the sample exercise', () => {
  const MATERIAL = {
    text: VERSE,
    nextText: 'For God did not send his Son into the world to condemn the world.',
    neighbourTexts: [
      'The one who believes in him is not condemned.',
      'And this is the basis for judging that the light has come into the world.',
      'For everyone who does evil deeds hates the light and does not come to the light.',
    ],
  };
  const SEED = sampleSeed('u', '2026-09-03');

  it('ships the pieces around the gaps and the gap sizes, never the words', () => {
    const exercise = buildSampleExercise(MATERIAL, SEED, 'blanks');
    expect(exercise?.kind).toBe('blanks');
    if (exercise?.kind !== 'blanks') throw new Error('expected blanks');
    expect(exercise.blankCount).toBeGreaterThan(0);
    expect(exercise.cloze.segments).toHaveLength(exercise.blankCount + 1);
    expect(JSON.stringify(exercise)).not.toMatch(/"word"/);
  });

  it('refuses a verse too short to hide anything in', () => {
    expect(buildSampleExercise({ text: 'Jesus wept.' }, 's', 'blanks')).toBeNull();
  });

  it('marks the same gaps it asked, from the same seed', () => {
    const exercise = buildSampleExercise(MATERIAL, SEED, 'blanks')!;
    if (exercise.kind !== 'blanks') throw new Error('expected blanks');
    // Rebuild the answers from the visible pieces: what is missing between segments.
    const answers: string[] = [];
    let rest = VERSE;
    for (let i = 0; i < exercise.cloze.segments.length - 1; i += 1) {
      const before = exercise.cloze.segments[i];
      const after = exercise.cloze.segments[i + 1];
      rest = rest.slice(rest.indexOf(before) + before.length);
      const end = after ? rest.indexOf(after) : rest.length;
      answers.push(rest.slice(0, end).trim());
      rest = rest.slice(end);
    }
    expect(gradeSampleAnswer(MATERIAL, SEED, 'blanks', { words: answers })).toBe(true);
    expect(gradeSampleAnswer(MATERIAL, SEED, 'blanks', { words: answers.map(() => 'wrong') })).toBe(false);
    // A different day is a different question; yesterday's answers do not fit.
    expect(
      gradeSampleAnswer(MATERIAL, sampleSeed('u', '2026-09-02'), 'blanks', { words: answers }),
    ).toBe(false);
  });

  it('offers four ways to be asked about the same verse', () => {
    expect(SAMPLE_EXERCISES).toEqual(['blanks', 'letters', 'order', 'next']);
    const kinds = availableSampleExercises(MATERIAL, SEED);
    expect(kinds).toEqual(['blanks', 'letters', 'order', 'next']);
    for (const kind of kinds) {
      expect(buildSampleExercise(MATERIAL, SEED, kind)?.kind).toBe(kind);
    }
  });

  it('never ships the answer key in any of them', () => {
    for (const kind of SAMPLE_EXERCISES) {
      const built = JSON.stringify(buildSampleExercise(MATERIAL, SEED, kind));
      // `"order"` as a *value* is the exercise's own name; as an array it is the answer key.
      expect(built).not.toMatch(/"order":\s*\[/);
      expect(built).not.toMatch(/"answerIndex"/);
      expect(built).not.toMatch(/"blanks":\s*\[/);
      expect(built).not.toMatch(/"word"/);
    }
  });

  it('marks first letters by what was written, not how it was punctuated', () => {
    expect(gradeSampleAnswer(MATERIAL, SEED, 'letters', { text: VERSE })).toBe(true);
    expect(gradeSampleAnswer(MATERIAL, SEED, 'letters', { text: 'no idea at all' })).toBe(false);
  });

  it('marks the order against the arrangement it shuffled', () => {
    const exercise = buildSampleExercise(MATERIAL, SEED, 'order')!;
    if (exercise.kind !== 'order') throw new Error('expected order');
    expect(exercise.phrases.length).toBeGreaterThanOrEqual(3);
    const wrong = exercise.phrases.map((_, i) => i);
    // Not asserting the right answer here — the key never leaves the builder. A guess of
    // "leave everything where it is" is wrong by construction, which is the point of the rotate.
    expect(gradeSampleAnswer(MATERIAL, SEED, 'order', { order: wrong })).toBe(false);
  });

  it('has no "what follows" for a verse with nothing after it', () => {
    const last = { text: VERSE, nextText: null };
    expect(buildSampleExercise(last, SEED, 'next')).toBeNull();
    expect(availableSampleExercises(last, SEED)).not.toContain('next');
    // And an answer to a question that could not be built is wrong, never right.
    expect(gradeSampleAnswer(last, SEED, 'next', { option: 'anything' })).toBe(false);
  });

  it('asks a different question of the same verse for each exercise', () => {
    const seeds = SAMPLE_EXERCISES.map((kind) => sampleExerciseSeed(SEED, kind));
    expect(new Set(seeds).size).toBe(SAMPLE_EXERCISES.length);
  });

  it('accepts only the four names, and defaults the rest', () => {
    expect(isSampleExercise('blanks')).toBe(true);
    expect(isSampleExercise('verse.rebuild')).toBe(false);
    expect(isSampleExercise(null)).toBe(false);
    expect(SAMPLE_EXERCISES).toContain(DEFAULT_SAMPLE_EXERCISE);
  });
});
