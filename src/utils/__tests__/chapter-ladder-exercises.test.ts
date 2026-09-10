import { describe, it, expect } from 'vitest';
import {
  BARRED_PERSON_LABELS,
  MIN_ORDER_VERSES,
  askablePeople,
  buildChapterFinish,
  buildChapterOrder,
  buildChapterPerson,
  buildChapterVerse,
  chapterCueFor,
  chapterFinishCandidates,
  gradeChapterVerse,
  openingPrefix,
} from '@/utils/chapter-ladder-exercises';
import { gradeChoiceExercise } from '@/utils/choice-exercise';
import { markVerseSequence } from '@/utils/verse-ladder-exercises';
import type { ChapterVerse } from '@/utils/chapter-text';

/** Thirty-six distinct verses, each with two content words in its opening. */
const chapter: ChapterVerse[] = Array.from({ length: 36 }, (_, i) => ({
  number: i + 1,
  text: `Verse ${['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'][i % 6]} ${['stone', 'river', 'mountain', 'garden', 'harvest', 'shepherd'][Math.floor(i / 6)]} speaks of the kingdom and the covenant given to the people`,
}));

const others = [
  'In the beginning God created the heavens and the earth',
  'Blessed are the poor in spirit, for theirs is the kingdom',
  'The LORD is my shepherd, I shall not want',
  'Though I speak with the tongues of men and of angels',
];

describe('buildChapterVerse', () => {
  it('is deterministic per seed and marks the chapter verse right', () => {
    const a = buildChapterVerse({ verses: chapter, distractorTexts: others, seed: 'item:0' });
    const b = buildChapterVerse({ verses: chapter, distractorTexts: others, seed: 'item:0' });
    expect(a).toEqual(b);
    expect(a!.options).toHaveLength(4);
    expect(gradeChapterVerse(a!, a!.options[a!.answerIndex])).toBe(true);
    expect(gradeChapterVerse(a!, a!.options[(a!.answerIndex + 1) % 4])).toBe(false);
    // The verse behind the answer is one of the chapter's.
    expect(chapter).toContainEqual(a!.verse);
  });

  it('drops a distractor that opens like the answer', () => {
    /*
     * Synoptic parallels and the Psalms open verbatim. A candidate with the answer's own first
     * four words is not a distractor, so it is barred before the choice is built.
     */
    const built = buildChapterVerse({ verses: chapter, distractorTexts: others, seed: 'item:0' })!;
    const answer = built.options[built.answerIndex];
    const twin = `${answer} but then something else entirely`;
    const guarded = buildChapterVerse({
      verses: chapter,
      distractorTexts: [twin, ...others],
      seed: 'item:0',
    })!;
    expect(guarded.options.filter((o) => openingPrefix(o) === openingPrefix(answer))).toHaveLength(1);
  });

  it('needs three distractors from somewhere, and reaches for the fallback', () => {
    expect(buildChapterVerse({ verses: chapter, distractorTexts: [], seed: 's' })).toBeNull();
    expect(
      buildChapterVerse({ verses: chapter, distractorTexts: [], fallbackTexts: others, seed: 's' }),
    ).not.toBeNull();
  });
});

describe('buildChapterOrder', () => {
  it('draws one opening from each third, never shown solved', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const built = buildChapterOrder({ verses: chapter, seed })!;
      expect(built.phrases).toHaveLength(3);
      const numbers = built.verses.map((v) => v.number);
      expect(numbers[0]).toBeLessThanOrEqual(12);
      expect(numbers[1]).toBeGreaterThan(12);
      expect(numbers[1]).toBeLessThanOrEqual(24);
      expect(numbers[2]).toBeGreaterThan(24);
      // The identity arrangement is never the one shown.
      expect(built.order.every((position, index) => position === index)).toBe(false);
      // And the answer key marks the true order right.
      expect(markVerseSequence(built, built.order).correct).toBe(true);
    }
  });

  it('works on a three-verse chapter and refuses a shorter one', () => {
    const three = chapter.slice(0, 3);
    expect(buildChapterOrder({ verses: three, seed: 's' })!.verses.map((v) => v.number)).toEqual([1, 2, 3]);
    expect(buildChapterOrder({ verses: chapter.slice(0, MIN_ORDER_VERSES - 1), seed: 's' })).toBeNull();
  });

  it('gives up rather than ask about openings with nothing in them', () => {
    const empty = Array.from({ length: 6 }, (_, i) => ({ number: i + 1, text: 'And he said to them' }));
    expect(buildChapterOrder({ verses: empty, seed: 's' })).toBeNull();
  });
});

describe('buildChapterFinish', () => {
  it('prefers the verse the reader marked, and hides at least one word of it', () => {
    const built = buildChapterFinish({ verses: chapter, highlightedNumbers: [20], seed: 's', ratio: 0.3 })!;
    expect(built.verse.number).toBe(20);
    expect(built.cloze.blanks.length).toBeGreaterThan(0);
  });

  it('falls back to any verse long enough to spare a word', () => {
    expect(chapterFinishCandidates(chapter, []).length).toBe(36);
    const short = [{ number: 1, text: 'Jesus wept.' }];
    expect(chapterFinishCandidates(short, [1])).toEqual([]);
    expect(buildChapterFinish({ verses: short, highlightedNumbers: [], seed: 's', ratio: 0.3 })).toBeNull();
  });
});

describe('buildChapterPerson', () => {
  const people = ['Jesus', 'Nicodemus', 'John', 'Moses'];

  it('bars the names too obvious to answer and too weighty to be wrong, on both sides', () => {
    for (const name of ['Jesus', 'God', 'the LORD', 'Holy Spirit']) {
      expect(BARRED_PERSON_LABELS.has(name.toLowerCase())).toBe(true);
    }
    expect(askablePeople(people)).toEqual(['Nicodemus', 'John', 'Moses']);
    const built = buildChapterPerson({
      people,
      pool: ['Jesus', 'Paul', 'Peter', 'Abraham', 'God'],
      seed: 's',
    })!;
    expect(built.options).not.toContain('Jesus');
    expect(built.options).not.toContain('God');
    // Anyone in the chapter is right; no one in the chapter is offered as wrong.
    for (const option of built.options) {
      const inChapter = people.includes(option);
      expect(gradeChoiceExercise(built, option, askablePeople(people))).toBe(inChapter);
    }
  });

  it('has nothing to ask when only barred names appear', () => {
    expect(buildChapterPerson({ people: ['Jesus', 'God'], pool: ['Paul', 'Peter', 'John'], seed: 's' })).toBeNull();
  });
});

describe('chapterCueFor', () => {
  it('gives a seeded opening from a chapter, or nothing from an empty one', () => {
    expect(chapterCueFor(chapter, 'x')).toBe(chapterCueFor(chapter, 'x'));
    expect(chapterCueFor([], 'x')).toBeNull();
  });
});
