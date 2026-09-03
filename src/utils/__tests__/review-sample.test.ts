import { describe, it, expect } from 'vitest';
import {
  SAMPLE_FALLBACK_REFERENCES,
  buildSampleExercise,
  gradeSampleAnswer,
  pickSampleReference,
  sampleSeed,
} from '@/utils/review-sample';

const VERSE =
  'For this is the way God loved the world: He gave his one and only Son, so that everyone who believes in him will not perish but have eternal life.';

describe('pickSampleReference', () => {
  it('takes the reader own passage first, and says so', () => {
    expect(pickSampleReference({ ownReferences: ['John 15:5', 'Romans 8:15'], seed: 's' })).toEqual({
      reference: 'John 15:5',
      source: 'yours',
    });
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
  it('ships the pieces around the gaps and the gap sizes, never the words', () => {
    const exercise = buildSampleExercise(VERSE, sampleSeed('u', '2026-09-03'));
    expect(exercise).not.toBeNull();
    expect(exercise!.blankCount).toBeGreaterThan(0);
    expect(exercise!.cloze.segments).toHaveLength(exercise!.blankCount + 1);
    expect(JSON.stringify(exercise)).not.toMatch(/"word"/);
  });

  it('refuses a verse too short to hide anything in', () => {
    expect(buildSampleExercise('Jesus wept.', 's')).toBeNull();
  });

  it('marks the same gaps it asked, from the same seed', () => {
    const seed = sampleSeed('u', '2026-09-03');
    const exercise = buildSampleExercise(VERSE, seed)!;
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
    expect(gradeSampleAnswer(VERSE, seed, answers)).toBe(true);
    expect(gradeSampleAnswer(VERSE, seed, answers.map(() => 'wrong'))).toBe(false);
    // A different day is a different question; yesterday's answers do not fit.
    expect(gradeSampleAnswer(VERSE, sampleSeed('u', '2026-09-02'), answers)).toBe(false);
  });
});
