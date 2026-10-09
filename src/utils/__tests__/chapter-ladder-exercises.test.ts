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
  chapterEngagedCueCount,
  gradeChapterVerse,
  openingPrefix,
  askablePlaces,
  buildChapterPlace,
  BARRED_PLACE_LABELS,
  buildChapterMarked,
  chapterMarkedDraw,
  gradeChapterMarked,
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
  /** Verses the reader highlighted or cited. */
  const engaged = [4, 17, 30];

  it('asks only about a verse the reader engaged with', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const built = buildChapterVerse({ verses: chapter, engagedNumbers: engaged, distractorTexts: others, seed })!;
      expect(engaged).toContain(built.verse.number);
    }
    expect(chapterEngagedCueCount(chapter, engaged)).toBe(3);
  });

  it('asks nothing of a chapter that was only read', () => {
    // The probe and the builder agree: no engaged verse, no question.
    expect(chapterEngagedCueCount(chapter, [])).toBe(0);
    expect(buildChapterVerse({ verses: chapter, engagedNumbers: [], distractorTexts: others, seed: 's' })).toBeNull();
  });

  it('is deterministic per seed and marks the chapter verse right', () => {
    const a = buildChapterVerse({ verses: chapter, engagedNumbers: engaged, distractorTexts: others, seed: 'item:0' });
    const b = buildChapterVerse({ verses: chapter, engagedNumbers: engaged, distractorTexts: others, seed: 'item:0' });
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
    const built = buildChapterVerse({ verses: chapter, engagedNumbers: engaged, distractorTexts: others, seed: 'item:0' })!;
    const answer = built.options[built.answerIndex];
    const twin = `${answer} but then something else entirely`;
    const guarded = buildChapterVerse({
      verses: chapter,
      engagedNumbers: engaged,
      distractorTexts: [twin, ...others],
      seed: 'item:0',
    })!;
    expect(guarded.options.filter((o) => openingPrefix(o) === openingPrefix(answer))).toHaveLength(1);
  });

  it('needs three distractors from somewhere, and reaches for the fallback', () => {
    expect(buildChapterVerse({ verses: chapter, engagedNumbers: engaged, distractorTexts: [], seed: 's' })).toBeNull();
    expect(
      buildChapterVerse({ verses: chapter, engagedNumbers: engaged, distractorTexts: [], fallbackTexts: others, seed: 's' }),
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
  it('asks for the verse the reader engaged with, and hides at least one word of it', () => {
    const built = buildChapterFinish({ verses: chapter, engagedNumbers: [20], seed: 's', ratio: 0.3 })!;
    expect(built.verse.number).toBe(20);
    expect(built.cloze.blanks.length).toBeGreaterThan(0);
  });

  it('never falls back to a verse the reader did not engage with', () => {
    // A chapter that was only read gets whole-chapter questions, not "finish verse 12".
    expect(chapterFinishCandidates(chapter, [])).toEqual([]);
    expect(buildChapterFinish({ verses: chapter, engagedNumbers: [], seed: 's', ratio: 0.3 })).toBeNull();
    const short = [{ number: 1, text: 'Jesus wept.' }];
    expect(chapterFinishCandidates(short, [1])).toEqual([]);
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

describe('chapter places', () => {
  it('bars the labels that are in every chapter from being an answer', () => {
    expect(askablePlaces(['Bethany', 'heaven', 'the earth', 'Capernaum'])).toEqual([
      'Bethany',
      'Capernaum',
    ]);
    expect(BARRED_PLACE_LABELS.has('the world')).toBe(true);
    // A real place with a real location stays in, however famous.
    expect(askablePlaces(['Jerusalem'])).toEqual(['Jerusalem']);
  });

  it('never offers another place from the same chapter as the wrong answer', () => {
    const exercise = buildChapterPlace({
      places: ['Bethany', 'Jerusalem'],
      pool: ['Corinth', 'Ephesus', 'Philippi', 'Rome'],
      seed: 'item:2',
    });
    expect(exercise).not.toBeNull();
    const wrong = exercise!.options.filter((_, i) => i !== exercise!.answerIndex);
    expect(wrong).not.toContain('Bethany');
    expect(wrong).not.toContain('Jerusalem');
  });

  it('has no question for a chapter the index names nowhere askable in', () => {
    expect(
      buildChapterPlace({ places: ['heaven', 'the earth'], pool: ['Rome', 'Corinth'], seed: 's' }),
    ).toBeNull();
    expect(buildChapterPlace({ places: [], pool: ['Rome'], seed: 's' })).toBeNull();
  });

  it('never draws a barred label into the options from the pool either', () => {
    const exercise = buildChapterPlace({
      places: ['Bethany'],
      pool: ['heaven', 'the earth', 'Corinth', 'Ephesus', 'Rome'],
      seed: 'item:9',
    });
    expect(exercise!.options).not.toContain('heaven');
    expect(exercise!.options).not.toContain('the earth');
  });
});

describe('chapter.marked', () => {
  const verses = Array.from({ length: 10 }, (_, i) => ({
    number: i + 1,
    text: `Verse number ${i + 1} says a distinct thing worth reading here today.`,
  }));

  it('asks about a verse the reader marked, never one they did not', () => {
    const exercise = buildChapterMarked({ verses, highlightedNumbers: [4], seed: 'item:1' });
    expect(exercise).not.toBeNull();
    expect(exercise!.verse.number).toBe(4);
    expect(exercise!.options[exercise!.answerIndex]).toContain('number 4');
  });

  it('never offers another marked verse as the wrong answer', () => {
    const exercise = buildChapterMarked({ verses, highlightedNumbers: [2, 7], seed: 'item:1' });
    const wrong = exercise!.options.filter((_, i) => i !== exercise!.answerIndex);
    expect(wrong.some((option) => option.includes('number 2'))).toBe(false);
    expect(wrong.some((option) => option.includes('number 7'))).toBe(false);
  });

  it('marks the verse they marked as right and an unmarked one as wrong', () => {
    const exercise = buildChapterMarked({ verses, highlightedNumbers: [2, 7], seed: 'item:1' })!;
    const shown = exercise.options[exercise.answerIndex];
    const wrong = exercise.options.find((_, i) => i !== exercise.answerIndex)!;
    // Every verse they marked is acceptable, not only the one this build put forward.
    const acceptable = [verses[1], verses[6]].map((verse) =>
      verse.text.split(' ').slice(0, 8).join(' '),
    );
    expect(gradeChapterMarked(exercise, shown, acceptable)).toBe(true);
    expect(gradeChapterMarked(exercise, wrong, acceptable)).toBe(false);
  });

  it('has no question when the reader marked nothing', () => {
    expect(buildChapterMarked({ verses, highlightedNumbers: [], seed: 's' })).toBeNull();
  });

  it('builds for every seed exactly when the probe says it can', () => {
    /*
     * Whether the question existed used to depend on which marked verse the seed drew: one whose
     * opening shared its first words with the rest had too few wrong answers, and the probe —
     * counting highlights — had already promised it. The seed now draws among viable verses only.
     */
    const echo = [
      ...verses.slice(0, 5),
      // Five verses that open the same way as the marked one below.
      ...Array.from({ length: 5 }, (_, i) => ({ number: 6 + i, text: `And the Lord said ${i} things.` })),
      { number: 11, text: 'And the Lord said again a thing worth hearing.' },
    ];
    for (const marked of [[11], [2, 11], [1, 2, 3, 4, 5], []]) {
      const viable = chapterMarkedDraw(echo, marked).viable.length > 0;
      for (const seed of ['a', 'b', 'c', 'x:1:0', 'y:3:2']) {
        const built = buildChapterMarked({ verses: echo, highlightedNumbers: marked, seed });
        expect(built !== null, `${marked} ${seed}`).toBe(viable);
      }
    }
  });

  it('has no question when almost every verse is marked, because every option would be right', () => {
    const all = verses.map((verse) => verse.number);
    expect(buildChapterMarked({ verses, highlightedNumbers: all, seed: 's' })).toBeNull();
    // Three unmarked left is still too few to ask against without the answer standing out.
    expect(
      buildChapterMarked({ verses, highlightedNumbers: all.slice(0, 8), seed: 's' }),
    ).toBeNull();
  });
});

describe('chapter choices by tier', () => {
  const sameBook = ['And the Word became flesh and dwelt among us', 'Let not your hearts be troubled, believe in God'];
  const otherBooks = ['In the beginning God created the heavens and the earth', 'The LORD is my shepherd, I shall not want'];
  const seeds = ['a', 'b', 'c', 'd', 'e', 'f'];
  /** An option is a cue — the opening words — so match it on its first three. */
  const from = (texts: readonly string[]) => (option: string) =>
    texts.some((text) => text.startsWith(option.split(' ').slice(0, 3).join(' ')));

  it('opens with three options from other books, and moves to four from the same book', () => {
    for (const seed of seeds) {
      const easy = buildChapterVerse({
        verses: chapter,
        engagedNumbers: [4],
        distractorTexts: sameBook,
        farTexts: otherBooks,
        tier: 0,
        seed,
      })!;
      expect(easy.options).toHaveLength(3);
      const easyWrong = easy.options.filter((_, i) => i !== easy.answerIndex);
      expect(easyWrong.every(from(otherBooks))).toBe(true);

      const hard = buildChapterVerse({
        verses: chapter,
        engagedNumbers: [4],
        distractorTexts: sameBook,
        farTexts: otherBooks,
        tier: 2,
        seed,
      })!;
      expect(hard.options).toHaveLength(4);
      const hardWrong = hard.options.filter((_, i) => i !== hard.answerIndex);
      // Both same-book openings are taken before anything from another book.
      expect(hardWrong.filter(from(sameBook))).toHaveLength(2);
    }
  });

  it('asks the same verse at every tier — only the options move', () => {
    const at = (tier: 0 | 2) =>
      buildChapterVerse({ verses: chapter, engagedNumbers: [4, 17, 30], distractorTexts: sameBook, farTexts: otherBooks, tier, seed: 'x' })!.verse.number;
    expect(at(0)).toBe(at(2));
  });
});
