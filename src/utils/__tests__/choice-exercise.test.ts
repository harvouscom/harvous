import { describe, it, expect } from 'vitest';
import { buildChoiceExercise, gradeChoiceExercise } from '@/utils/choice-exercise';

const pool = ['Romans 8:28', 'Ephesians 2:8', 'Psalm 23:1', '1 Peter 2:9', 'Genesis 1:1'];

describe('buildChoiceExercise', () => {
  it('offers four options with exactly one acceptable answer among them', () => {
    const ex = buildChoiceExercise({ answers: ['John 15:5'], pool, seed: 'a' })!;
    expect(ex.options).toHaveLength(4);
    expect(new Set(ex.options).size).toBe(4);
    expect(ex.options[ex.answerIndex]).toBe('John 15:5');
  });

  it('is the same card for the same seed, and differs across seeds', () => {
    expect(buildChoiceExercise({ answers: ['John 15:5'], pool, seed: 'a' })).toEqual(
      buildChoiceExercise({ answers: ['John 15:5'], pool, seed: 'a' }),
    );
    expect(buildChoiceExercise({ answers: ['John 15:5'], pool, seed: 'b' })).not.toEqual(
      buildChoiceExercise({ answers: ['John 15:5'], pool, seed: 'a' }),
    );
  });

  it('never offers another acceptable answer as a wrong one', () => {
    /*
     * The bug this primitive exists to prevent. A note citing Romans 8 and Ephesians 2, asked
     * which it cited, must not put Ephesians 2 up as a distractor — it is not wrong.
     */
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const ex = buildChoiceExercise({
        answers: ['Romans 8:28', 'Ephesians 2:8'],
        pool,
        seed,
      })!;
      const wrong = ex.options.filter((_, i) => i !== ex.answerIndex);
      expect(wrong).not.toContain('Romans 8:28');
      expect(wrong).not.toContain('Ephesians 2:8');
    }
  });

  it('bars everything in `exclude`, which is not itself an answer', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const ex = buildChoiceExercise({
        answers: ['John 15:5'],
        pool,
        exclude: ['Psalm 23:1', '1 Peter 2:9'],
        seed,
      })!;
      expect(ex.options).not.toContain('Psalm 23:1');
      expect(ex.options).not.toContain('1 Peter 2:9');
    }
  });

  it('varies which acceptable answer it shows, rather than always the first', () => {
    const shown = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((seed) => {
        const ex = buildChoiceExercise({ answers: ['Romans 8:28', 'Ephesians 2:8'], pool, seed })!;
        return ex.options[ex.answerIndex];
      }),
    );
    expect(shown.size).toBe(2);
  });

  it('exhausts the reader own material before reaching for the fallback', () => {
    // An option someone has never encountered is not a distractor, it is noise.
    const ex = buildChoiceExercise({
      answers: ['John 15:5'],
      pool,
      fallbackPool: ['CANNED A', 'CANNED B', 'CANNED C'],
      seed: 'a',
    })!;
    expect(ex.options.filter((o) => o.startsWith('CANNED'))).toHaveLength(0);
  });

  it('tops up from the fallback when the reader material runs short', () => {
    const ex = buildChoiceExercise({
      answers: ['John 15:5'],
      pool: ['Romans 8:28'],
      fallbackPool: ['CANNED A', 'CANNED B', 'CANNED C'],
      seed: 'a',
    })!;
    expect(ex.options).toHaveLength(4);
    expect(ex.options).toContain('Romans 8:28');
    expect(ex.options.filter((o) => o.startsWith('CANNED'))).toHaveLength(2);
  });

  it('refuses rather than offering a thin question', () => {
    expect(buildChoiceExercise({ answers: ['John 15:5'], pool: ['Romans 8:28'], seed: 'a' })).toBeNull();
    expect(buildChoiceExercise({ answers: [], pool, seed: 'a' })).toBeNull();
    expect(buildChoiceExercise({ answers: ['   '], pool, seed: 'a' })).toBeNull();
  });

  it('ignores duplicates in the pool rather than offering the same option twice', () => {
    const ex = buildChoiceExercise({
      answers: ['John 15:5'],
      pool: ['Romans 8:28', 'romans 8:28', 'Romans  8:28', 'Psalm 23:1', 'Genesis 1:1'],
      seed: 'a',
    })!;
    expect(new Set(ex.options.map((o) => o.toLowerCase().replace(/\s+/g, ' '))).size).toBe(4);
  });
});

describe('gradeChoiceExercise', () => {
  const ex = buildChoiceExercise({ answers: ['John 15:5'], pool, seed: 'a' })!;

  it('accepts the shown answer and rejects the others', () => {
    expect(gradeChoiceExercise(ex, 'John 15:5', ['John 15:5'])).toBe(true);
    for (const wrong of ex.options.filter((o) => o !== 'John 15:5')) {
      expect(gradeChoiceExercise(ex, wrong, ['John 15:5'])).toBe(false);
    }
  });

  it('accepts any acceptable answer, however the build seeded it', () => {
    const multi = buildChoiceExercise({ answers: ['Romans 8:28', 'Ephesians 2:8'], pool, seed: 'c' })!;
    const shown = multi.options[multi.answerIndex];
    expect(gradeChoiceExercise(multi, shown, ['Romans 8:28', 'Ephesians 2:8'])).toBe(true);
  });

  it('rejects a correct-looking string that was never offered', () => {
    // A client inventing the right answer has not answered the question.
    expect(gradeChoiceExercise(ex, 'Habakkuk 2:4', ['Habakkuk 2:4'])).toBe(false);
  });

  it('does not care about case or spacing', () => {
    expect(gradeChoiceExercise(ex, '  john  15:5 ', ['John 15:5'])).toBe(true);
    expect(gradeChoiceExercise(ex, '', ['John 15:5'])).toBe(false);
  });
});
