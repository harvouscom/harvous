import { describe, it, expect } from 'vitest';
import {
  echoMatchesAnswer,
  reviewAnswerEcho,
  reviewResultSubject,
} from '@/utils/review-answer-echo';

describe('reviewAnswerEcho', () => {
  it('echoes the option a reader tapped, not the index of it', () => {
    expect(reviewAnswerEcho({ submitted: { option: 'I am the vine' }, correct: false })).toEqual({
      layout: 'line',
      manner: 'picked',
      parts: [{ text: 'I am the vine', state: 'wrong' }],
      correct: false,
    });
  });

  it('trails an opening off, the way the chip the reader tapped did', () => {
    const echo = reviewAnswerEcho({
      submitted: { option: 'In the beginning God created' },
      shown: { opening: true },
      correct: true,
    });
    expect(echo?.parts[0].text).toBe('In the beginning God created…');
  });

  it('echoes the altered rung word, and says nothing rather than a number', () => {
    expect(
      reviewAnswerEcho({ submitted: { wordIndex: 3 }, shown: { word: 'peace' }, correct: false })
        ?.parts,
    ).toEqual([{ text: 'peace', state: 'wrong' }]);
    // Without the word that index means nothing to a reader, so there is nothing to show.
    expect(reviewAnswerEcho({ submitted: { wordIndex: 3 }, correct: false })).toBeNull();
  });

  describe('an ordering', () => {
    const phrases = ['third clause', 'first clause', 'second clause'];

    it('marks by position, not by phrase', () => {
      /*
       * `markVerseSequence` compares `answer[i] === order[i]`, so the second mark is about the
       * second slot the reader filled — not about the phrase that happens to sit there.
       */
      const echo = reviewAnswerEcho({
        submitted: { order: [1, 0, 2] },
        shown: { phrases },
        parts: [true, false, true],
        correct: false,
      });
      expect(echo).toMatchObject({ layout: 'rows', manner: 'ordered' });
      expect(echo?.parts).toEqual([
        { text: 'first clause', state: 'right' },
        { text: 'third clause', state: 'wrong' },
        { text: 'second clause', state: 'right' },
      ]);
    });

    it('says nothing rather than echoing bare indices', () => {
      expect(reviewAnswerEcho({ submitted: { order: [1, 0] }, correct: false })).toBeNull();
    });
  });

  describe('words the reader produced', () => {
    it('marks each gap from its own verdict', () => {
      const echo = reviewAnswerEcho({
        submitted: { words: ['vine', 'peace'] },
        parts: [true, false],
        correct: false,
      });
      expect(echo).toMatchObject({ layout: 'words', manner: 'filled' });
      expect(echo?.parts).toEqual([
        { text: 'vine', state: 'right' },
        { text: 'peace', state: 'wrong' },
      ]);
    });

    it('drops marks that do not line up rather than putting them on the wrong word', () => {
      // A mark against the wrong word is worse than no mark, so a mismatch loses them all.
      const echo = reviewAnswerEcho({
        submitted: { words: ['vine', 'branches', 'fruit'] },
        parts: [true, false],
        correct: false,
      });
      expect(echo?.parts.every((part) => part.state === undefined)).toBe(true);
    });

    it('splits a written verse the way the marking split it', () => {
      /*
       * The regression this exists for: the card used to split the raw string, so a leading
       * space produced an empty first word and shifted every mark by one — praising the word
       * before the one that landed.
       */
      const echo = reviewAnswerEcho({
        submitted: { text: '  I am the vine ' },
        parts: [false, false, false, true],
        correct: true,
      });
      expect(echo).toMatchObject({ layout: 'words', manner: 'wrote' });
      expect(echo?.parts).toEqual([
        { text: 'I', state: 'wrong' },
        { text: 'am', state: 'wrong' },
        { text: 'the', state: 'wrong' },
        { text: 'vine', state: 'right' },
      ]);
    });

    it('never invents a per-word verdict where the rung was graded whole', () => {
      // Writing a verse from its first letters is marked as one thing; its words are shown plain.
      const echo = reviewAnswerEcho({ submitted: { text: 'I am the vine' }, correct: true });
      expect(echo?.parts.every((part) => part.state === undefined)).toBe(true);
      expect(echo?.correct).toBe(true);
    });
  });

  it('has nothing to hand back on a rung the reader judged themselves', () => {
    expect(reviewAnswerEcho({ submitted: null })).toBeNull();
    expect(reviewAnswerEcho({ submitted: {} })).toBeNull();
    expect(reviewAnswerEcho({ submitted: { words: ['  ', ''] } })).toBeNull();
  });
});

describe('reviewResultSubject', () => {
  it('names the passage once the answer is in, even where the question hid it', () => {
    // "Say where this is from." cannot print the reference while it is the answer. It can now.
    expect(
      reviewResultSubject({ prompt: 'Say where this is from.', scriptureReference: 'John 15:5' }),
    ).toBe('John 15:5');
  });

  it('stays quiet when the question already names it', () => {
    expect(
      reviewResultSubject({ prompt: 'Pick how John 15:5 begins.', scriptureReference: 'John 15:5' }),
    ).toBeNull();
  });

  it('falls from the reference to the note label to its title, then to nothing', () => {
    expect(reviewResultSubject({ prompt: 'A question', noteLabel: 'Adoption' })).toBe('Adoption');
    expect(reviewResultSubject({ prompt: 'A question', noteTitle: 'My journey' })).toBe('My journey');
    expect(reviewResultSubject({ prompt: 'A question' })).toBeNull();
  });
});

describe('echoMatchesAnswer', () => {
  it('spots the one case where the card would print a sentence twice', () => {
    const echo = reviewAnswerEcho({ submitted: { option: 'I am the vine' }, correct: true })!;
    expect(echoMatchesAnswer(echo, 'I am the vine')).toBe(true);
    expect(echoMatchesAnswer(echo, 'The LORD is my shepherd')).toBe(false);
  });

  it('sees past the ellipsis an opening was shown with', () => {
    const echo = reviewAnswerEcho({
      submitted: { option: 'In the beginning God created' },
      shown: { opening: true },
      correct: true,
    })!;
    expect(echoMatchesAnswer(echo, 'In the beginning God created')).toBe(true);
  });

  it('leaves a written answer alone — those are never the same words', () => {
    const echo = reviewAnswerEcho({ submitted: { text: 'I am the vine' }, correct: true })!;
    expect(echoMatchesAnswer(echo, 'I am the vine')).toBe(false);
  });
});
