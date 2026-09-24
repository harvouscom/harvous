import { describe, expect, it } from 'vitest';
import { REVEAL_EXERCISE_FIELD, revealCarriesExercise } from '@/utils/review-reveal-exercise';
import { alternativeSteps, REVIEW_PROMPT_KEYS, VERSE_FAMILIES } from '@/utils/review-prompts';

describe('revealCarriesExercise', () => {
  it('names the field every rung is asked with', () => {
    // A new rung must say what its card needs, or the sitting cannot tell a built one from a blank.
    for (const key of REVIEW_PROMPT_KEYS) expect(REVEAL_EXERCISE_FIELD[key], key).toBeTruthy();
  });

  it('fails a note question that came back without its options', () => {
    // The screenshot: "Pick the note this line is from." over an empty card.
    expect(revealCarriesExercise('note.passage', { noteChoice: null })).toBe(false);
    expect(revealCarriesExercise('note.passage', {})).toBe(false);
    expect(revealCarriesExercise('note.passage', { noteChoice: { options: ['a', 'b', 'c', 'd'] } })).toBe(true);
  });

  it('fails blanks with no gap in them', () => {
    expect(revealCarriesExercise('verse.rebuild', { cloze: { blankLengths: [] } })).toBe(false);
    expect(revealCarriesExercise('verse.rebuild', { cloze: { blankLengths: [4] } })).toBe(true);
    expect(revealCarriesExercise('chapter.finish', { cloze: null })).toBe(false);
  });

  it('passes the written recall, whose card is the prompt and a box', () => {
    expect(revealCarriesExercise('verse.recall', {})).toBe(true);
  });

  it('fails a rung it does not know, and a missing reveal', () => {
    expect(revealCarriesExercise('note.recognize', { noteChoice: { options: [] } })).toBe(false);
    expect(revealCarriesExercise('verse.locate', null)).toBe(false);
    expect(revealCarriesExercise(null, { choice: { options: [] } })).toBe(false);
  });
});

describe('alternativeSteps', () => {
  it('tries the opening steps nearest where the item stands, never its own', () => {
    expect(alternativeSteps('verse', 4)).toEqual([3, 6, 1, 0]);
    expect(alternativeSteps('note', 0)).toEqual([1, 2]);
    expect(alternativeSteps('chapter', 1)).toEqual([0]);
  });

  it('keeps a climbed verse in maintenance before sending it back to a way in', () => {
    const top = VERSE_FAMILIES.length + 2;
    expect(alternativeSteps('verse', top).slice(0, 2)).toEqual([top + 1, top + 2]);
  });

  it('copes with a nonsense step', () => {
    expect(alternativeSteps('note', Number.NaN)).toEqual([1, 2]);
  });
});
