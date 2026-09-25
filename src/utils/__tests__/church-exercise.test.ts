import { describe, expect, it } from 'vitest';
import {
  CHURCH_PROMPT_MAX,
  buildChurchChoice,
  buildChurchMatch,
  buildChurchOrder,
  churchExerciseTruth,
  cleanChurchText,
  gradeChurchChoice,
  markChurchMatch,
  markChurchOrder,
  parseChurchExerciseContent,
  parseChurchMatchAnswer,
  validateChurchExerciseContent,
  validateChurchPrompt,
  type ChurchChoiceContent,
  type ChurchMatchContent,
  type ChurchOrderContent,
} from '../church-exercise';

const choice: ChurchChoiceContent = {
  options: ['Peter', 'Andrew', 'James', 'John'],
  correctIndex: 1,
};
const order: ChurchOrderContent = { items: ['Creation', 'Flood', 'Abraham', 'Exodus'] };
const match: ChurchMatchContent = {
  pairs: [
    { left: 'John 3:16', right: 'For God so loved the world' },
    { left: 'Romans 8:28', right: 'All things work together for good' },
    { left: 'Psalm 23:1', right: 'The Lord is my shepherd' },
  ],
};

describe('validating what staff wrote', () => {
  it('cleans to plain text', () => {
    expect(cleanChurchText('  <b>Who</b>   was\nfirst? ')).toBe('Who was first?');
  });

  it('bounds the question', () => {
    expect(validateChurchPrompt('   ')).toMatchObject({ ok: false, code: 'PROMPT_REQUIRED' });
    expect(validateChurchPrompt('x'.repeat(CHURCH_PROMPT_MAX + 1))).toMatchObject({ ok: false, code: 'PROMPT_TOO_LONG' });
    expect(validateChurchPrompt('Who did Jesus call first?')).toEqual({ ok: true, value: 'Who did Jesus call first?' });
  });

  it('wants three to five distinct options with exactly one marked right', () => {
    expect(validateChurchExerciseContent('choice', choice).ok).toBe(true);
    expect(validateChurchExerciseContent('choice', { options: ['a', 'b'], correctIndex: 0 })).toMatchObject({ code: 'OPTION_COUNT' });
    expect(validateChurchExerciseContent('choice', { options: ['a', 'b', 'c', 'd', 'e', 'f'], correctIndex: 0 })).toMatchObject({ code: 'OPTION_COUNT' });
    expect(validateChurchExerciseContent('choice', { options: ['a', 'B', 'b'], correctIndex: 0 })).toMatchObject({ code: 'OPTION_DUPLICATE' });
    expect(validateChurchExerciseContent('choice', { options: ['a', 'b', 'c'] })).toMatchObject({ code: 'CORRECT_REQUIRED' });
    expect(validateChurchExerciseContent('choice', { options: ['a', 'b', 'c'], correctIndex: 3 })).toMatchObject({ code: 'CORRECT_REQUIRED' });
    expect(validateChurchExerciseContent('choice', { options: ['a', '', 'c'], correctIndex: 0 })).toMatchObject({ code: 'OPTION_EMPTY' });
  });

  it('wants three to six distinct pieces to order', () => {
    expect(validateChurchExerciseContent('order', order).ok).toBe(true);
    expect(validateChurchExerciseContent('order', { items: ['a', 'b'] })).toMatchObject({ code: 'ITEM_COUNT' });
    expect(validateChurchExerciseContent('order', { items: ['a', 'b', 'A'] })).toMatchObject({ code: 'ITEM_DUPLICATE' });
  });

  it('wants three to six pairs, distinct on both sides', () => {
    expect(validateChurchExerciseContent('match', match).ok).toBe(true);
    expect(
      validateChurchExerciseContent('match', { pairs: [...match.pairs.slice(0, 2), { left: 'John 3:16', right: 'x' }] }),
    ).toMatchObject({ code: 'PAIR_DUPLICATE' });
    expect(validateChurchExerciseContent('match', { pairs: [{ left: 'a', right: '' }, ...match.pairs] })).toMatchObject({
      code: 'PAIR_EMPTY',
    });
  });

  it('reads a malformed stored definition as no question', () => {
    expect(parseChurchExerciseContent('choice', '{not json')).toBeNull();
    expect(parseChurchExerciseContent('verse', JSON.stringify(choice))).toBeNull();
    expect(parseChurchExerciseContent('choice', JSON.stringify(choice))).toEqual(choice);
  });
});

describe('what the reader sees never carries the key', () => {
  const payloadOf = (value: object, visible: string[]) =>
    JSON.stringify(Object.fromEntries(Object.entries(value).filter(([k]) => visible.includes(k))));

  it('multiple choice: options only', () => {
    const exercise = buildChurchChoice(choice, 'item:1:0');
    expect([...exercise.options].sort()).toEqual([...choice.options].sort());
    expect(exercise.options[exercise.answerIndex]).toBe('Andrew');
    expect(payloadOf(exercise, ['options'])).not.toMatch(/answerIndex|correctIndex/);
  });

  it('ordering: out of order, every time', () => {
    for (let n = 0; n < 50; n++) {
      const exercise = buildChurchOrder(order, `item:${n}`);
      expect(exercise.phrases).not.toEqual(order.items);
      expect([...exercise.phrases].sort()).toEqual([...order.items].sort());
    }
  });

  it('matching: the right column never lines up with the left', () => {
    for (let n = 0; n < 50; n++) {
      const exercise = buildChurchMatch(match, `item:${n}`);
      expect(exercise.key.every((partner, index) => partner === index)).toBe(false);
    }
  });

  it('matching: the key pairs every left item with its own partner', () => {
    for (let n = 0; n < 20; n++) {
      const exercise = buildChurchMatch(match, `item:${n}`);
      exercise.left.forEach((left, row) => {
        const pair = match.pairs.find((p) => p.left === left)!;
        expect(exercise.right[exercise.key[row]]).toBe(pair.right);
      });
    }
  });

  it('is the same card on every device for the same seed, and a new one after a miss', () => {
    expect(buildChurchChoice(choice, 'item:1:0')).toEqual(buildChurchChoice(choice, 'item:1:0'));
    const seeds = new Set(Array.from({ length: 8 }, (_, n) => buildChurchChoice(choice, `item:1:${n}`).options.join('|')));
    expect(seeds.size).toBeGreaterThan(1);
  });
});

describe('marking', () => {
  it('multiple choice, by text, and only among what was offered', () => {
    const exercise = buildChurchChoice(choice, 'seed');
    expect(gradeChurchChoice(exercise, ' andrew ')).toBe(true);
    expect(gradeChurchChoice(exercise, 'Peter')).toBe(false);
    expect(gradeChurchChoice(exercise, 'Bartholomew')).toBe(false);
    expect(gradeChurchChoice(exercise, '')).toBe(false);
  });

  it('ordering, per position', () => {
    const exercise = buildChurchOrder(order, 'seed');
    expect(markChurchOrder(exercise, exercise.order)).toEqual({ correct: true, parts: [true, true, true, true] });
    const swapped = [...exercise.order];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    expect(markChurchOrder(exercise, swapped)).toMatchObject({ correct: false, parts: [false, false, true, true] });
    expect(markChurchOrder(exercise, exercise.order.slice(0, 3)).correct).toBe(false);
  });

  it('matching, per pair', () => {
    const exercise = buildChurchMatch(match, 'seed');
    expect(markChurchMatch(exercise, exercise.key).correct).toBe(true);
    const wrong = exercise.key.map((partner) => (partner + 1) % exercise.key.length);
    expect(markChurchMatch(exercise, wrong)).toEqual({ correct: false, parts: [false, false, false] });
  });

  it('accepts only a well-formed match answer', () => {
    expect(parseChurchMatchAnswer([0, 2, 1], 3)).toEqual([0, 2, 1]);
    expect(parseChurchMatchAnswer([0, 3, 1], 3)).toBeNull();
    expect(parseChurchMatchAnswer([0, 1.5], 3)).toBeNull();
    expect(parseChurchMatchAnswer(Array.from({ length: 7 }, () => 0), 7)).toBeNull();
    expect(parseChurchMatchAnswer('0,1,2', 3)).toBeNull();
  });

  it('says the answer plainly once it is over', () => {
    expect(churchExerciseTruth(choice)).toBe('Andrew');
    expect(churchExerciseTruth(order)).toBe('Creation → Flood → Abraham → Exodus');
  });
});
