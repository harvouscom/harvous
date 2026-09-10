import { describe, it, expect } from 'vitest';
import {
  buildVerseCrossref,
  buildVersePerson,
  buildVerseTheme,
} from '@/utils/verse-knowledge-exercises';

const SEEDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

describe('buildVerseTheme', () => {
  const onVerse = ['abiding in Christ', 'fruitfulness', 'dependence on God', 'pruning'];
  const answers = onVerse.slice(0, 2); // the two above the relevance floor
  const pool = ['adoption', 'covenant', 'exile', 'wisdom', 'kingship', 'sabbath'];

  it('offers one of the themes the index puts on the verse, among three it does not', () => {
    const ex = buildVerseTheme({ answers, onVerse, pool, seed: 'a' })!;
    expect(ex.options).toHaveLength(4);
    expect(answers).toContain(ex.options[ex.answerIndex]);
  });

  it('never offers a theme the verse carries as a wrong answer, however weakly the index attaches it', () => {
    /*
     * The containment. "Pruning" is on the verse below the floor: it is not the answer, and it
     * is not wrong either, so it must not be a distractor.
     */
    for (const seed of SEEDS) {
      const ex = buildVerseTheme({ answers, onVerse, pool, seed })!;
      const wrong = ex.options.filter((_, i) => i !== ex.answerIndex);
      for (const theme of onVerse) expect(wrong).not.toContain(theme);
    }
  });

  it('draws from the reader own passages before the wider index', () => {
    const ex = buildVerseTheme({
      answers,
      onVerse,
      pool,
      fallbackPool: ['INDEX-ONLY-1', 'INDEX-ONLY-2', 'INDEX-ONLY-3'],
      seed: 'a',
    })!;
    expect(ex.options.filter((o) => o.startsWith('INDEX-ONLY'))).toHaveLength(0);
  });

  it('refuses rather than asking about a verse with no theme', () => {
    expect(buildVerseTheme({ answers: [], onVerse: [], pool, seed: 'a' })).toBeNull();
  });
});

describe('buildVersePerson', () => {
  const onVerse = ['Moses', 'Aaron'];
  const pool = ['David', 'Ruth', 'Peter', 'Esther', 'Elijah'];

  it('never offers someone the index places on the verse as the wrong answer', () => {
    // A verse about both Moses and Aaron never offers Aaron as the wrong answer to Moses.
    for (const seed of SEEDS) {
      const ex = buildVersePerson({ answers: onVerse, onVerse, pool, seed })!;
      const wrong = ex.options.filter((_, i) => i !== ex.answerIndex);
      expect(wrong).not.toContain('Moses');
      expect(wrong).not.toContain('Aaron');
    }
  });

  it('refuses with nobody on the verse', () => {
    expect(buildVersePerson({ answers: [], onVerse: [], pool, seed: 'a' })).toBeNull();
  });
});

describe('buildVerseCrossref', () => {
  const answerText = 'Abide in me, and I in you. As the branch cannot bear fruit by itself';
  const distractors = [
    'The Lord is my shepherd; I shall not want.',
    'For God so loved the world that he gave his only Son',
    'In the beginning God created the heavens and the earth.',
    'Trust in the Lord with all your heart and lean not on your own understanding',
  ];

  it('shows the cross-reference as an opening, never as a reference', () => {
    /*
     * Naming it would make the answer arithmetic, and a reader is far more likely to recognise
     * "Abide in me, and I in you" than "John 15:4".
     */
    const ex = buildVerseCrossref({ answerText, distractorTexts: distractors, seed: 'a' })!;
    for (const option of ex.options) {
      expect(option).not.toMatch(/\d+:\d+/);
      expect(option.split(/\s+/).length).toBeLessThanOrEqual(8);
    }
    expect(answerText.startsWith(ex.options[ex.answerIndex])).toBe(true);
  });

  it('refuses rather than offering a thin question', () => {
    expect(buildVerseCrossref({ answerText, distractorTexts: distractors.slice(0, 1), seed: 'a' })).toBeNull();
  });
});
