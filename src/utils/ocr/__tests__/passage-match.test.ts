import { describe, expect, it } from 'vitest';
import {
  choosePassage,
  passageWords,
  passageReference,
  pickProbePhrases,
  rankCandidateChapters,
  scoreChapter,
  type PassageScore,
  type PassageVerse,
} from '../passage-match';

// Public-domain texts (KJV, BSB) of John 3:14–18.
const KJV: Record<number, string> = {
  14: 'And as Moses lifted up the serpent in the wilderness, even so must the Son of man be lifted up:',
  15: 'That whosoever believeth in him should not perish, but have eternal life.',
  16: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.',
  17: 'For God sent not his Son into the world to condemn the world; but that the world through him might be saved.',
  18: 'He that believeth on him is not condemned: but he that believeth not is condemned already, because he hath not believed in the name of the only begotten Son of God.',
};
const BSB: Record<number, string> = {
  14: 'Just as Moses lifted up the snake in the wilderness, so the Son of Man must be lifted up,',
  15: 'that everyone who believes in Him may have eternal life.',
  16: 'For God so loved the world that He gave His one and only Son, that everyone who believes in Him shall not perish but have eternal life.',
  17: 'For God did not send His Son into the world to condemn the world, but to save the world through Him.',
  18: 'Whoever believes in Him is not condemned, but whoever does not believe has already been condemned, because he has not believed in the name of God’s one and only Son.',
};

function chapter(translationId: string, text: Record<number, string>): PassageVerse[] {
  return Object.entries(text).map(([verse, t]) => ({
    translationId,
    book: 'John',
    chapter: 3,
    verse: Number(verse),
    text: t,
  }));
}

/** John 3:16–17 KJV as a phone reads it: verse numbers inline, a hyphen across a line, typos. */
const KJV_PAGE = `16 For God so loved the world, that he gave his only begot-
ten Son, that whosoever believeth in him should not perish, but have everlasting life.
17 For God sent not his Son into the wor1d to condemn the world; but that the world through him might be saued.`;

function score(page: string, verses: PassageVerse[]): PassageScore {
  const result = scoreChapter(passageWords(page), verses);
  expect(result).not.toBeNull();
  return result!;
}

describe('scoreChapter', () => {
  it('finds exactly the verses on the page, not the neighbour that repeats them', () => {
    // 3:15 is nearly all of 3:16 — a bag-of-words score pulled it in.
    const kjv = score(KJV_PAGE, chapter('KJV', KJV));
    expect([kjv.verseStart, kjv.verseEnd]).toEqual([16, 17]);
    expect(kjv.text).toBe(`${KJV[16]} ${KJV[17]}`);
    expect(kjv.recall).toBeGreaterThan(0.85);
  });

  it('scores the printed translation above one with the same meaning', () => {
    const kjv = score(KJV_PAGE, chapter('KJV', KJV));
    const bsb = scoreChapter(passageWords(KJV_PAGE), chapter('BSB', BSB));
    // KJV ≈ 0.94, BSB ≈ 0.74: far enough apart that BSB is not even offered as an alternative.
    expect(bsb === null || bsb.f1 < kjv.f1 - 0.15).toBe(true);
    expect(choosePassage(bsb ? [kjv, bsb] : [kjv], 'BSB').match?.translation).toBe('KJV');
  });
});

describe('choosePassage', () => {
  const kjvScore = () => score(KJV_PAGE, chapter('KJV', KJV));

  it('picks the best translation and offers close ones as alternatives', () => {
    const kjv = kjvScore();
    const result = choosePassage([kjv, { ...kjv, translationId: 'NKJV', f1: kjv.f1 - 0.1 }], null);
    expect(result.match).toMatchObject({ reference: 'John 3:16-17', translation: 'KJV' });
    expect(result.alternatives.map((a) => a.translation)).toEqual(['NKJV']);
    expect(result.ambiguous).toBe(false);
  });

  it('breaks a tie with the reader’s default translation', () => {
    const kjv = kjvScore();
    const twin = { ...kjv, translationId: 'NKJV', f1: kjv.f1 - 0.005 };
    expect(choosePassage([kjv, twin], 'nkjv').match?.translation).toBe('NKJV');
    expect(choosePassage([kjv, twin], 'nkjv').ambiguous).toBe(false);
  });

  it('marks a tie the default cannot break as ambiguous rather than guessing', () => {
    const kjv = kjvScore();
    const twin = { ...kjv, translationId: 'NKJV', f1: kjv.f1 - 0.005 };
    const result = choosePassage([kjv, twin], 'ESV');
    expect(result.ambiguous).toBe(true);
    expect(result.alternatives.map((a) => a.translation)).toEqual(['NKJV']);
  });

  it('offers nothing for a page that is not Scripture', () => {
    const handout = 'Welcome to small group. This week we will talk about prayer, how the world sees it, and why God so often surprises us.';
    const result = scoreChapter(passageWords(handout), chapter('KJV', KJV));
    expect(choosePassage(result ? [result] : [], 'KJV').match).toBeNull();
  });
});

describe('pickProbePhrases', () => {
  it('uses only clean runs of words — no verse numbers, no misread tokens', () => {
    const phrases = pickProbePhrases(KJV_PAGE);
    expect(phrases.length).toBeGreaterThan(0);
    for (const phrase of phrases) {
      expect(phrase.split(' ')).toHaveLength(6);
      expect(phrase).not.toMatch(/\d|wor1d/);
    }
  });

  it('returns nothing for a page with no prose', () => {
    expect(pickProbePhrases('Romans 8:28 — 1 Cor 13:4 — Eph 2:8')).toEqual([]);
  });
});

describe('passageReference', () => {
  it('cites one psalm the way people write it', () => {
    expect(passageReference('Psalms', 23, 1, 3)).toBe('Psalm 23:1-3');
    expect(passageReference('John', 3, 16, 16)).toBe('John 3:16');
  });
});

describe('rankCandidateChapters', () => {
  it('ranks chapters by how many distinct phrases landed in them', () => {
    const ranked = rankCandidateChapters([
      [{ book: 'John', chapter: 3 }, { book: 'John', chapter: 3 }, { book: '1 John', chapter: 4 }],
      [{ book: 'John', chapter: 3 }],
      [{ book: 'Romans', chapter: 5 }],
    ]);
    expect(ranked[0]).toEqual({ book: 'John', chapter: 3 });
    expect(ranked).toHaveLength(3);
  });
});
