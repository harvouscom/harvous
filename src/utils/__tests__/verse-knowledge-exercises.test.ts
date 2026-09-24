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
  // John 15:5's cross-references, and passages the reader has of their own.
  const answers = ['John 15:4', 'Galatians 2:20', 'Philippians 4:13'];
  const verse = 'John 15:5';
  const pool = ['John 10:11', 'John 14:6', 'John 15:6', 'John 3:16'];

  it('asks with references, and exactly one option is a cross-reference', () => {
    const ex = buildVerseCrossref({ answers, verse, pool, seed: 'a' })!;
    expect(ex.options).toHaveLength(4);
    for (const option of ex.options) expect(option).toMatch(/^[1-3]?\s?[A-Za-z ]+ \d+:\d+/);
    expect(ex.options.filter((option) => answers.includes(option))).toHaveLength(1);
    expect(answers).toContain(ex.options[ex.answerIndex]);
  });

  it('never offers the verse itself', () => {
    for (let i = 0; i < 20; i++) {
      const ex = buildVerseCrossref({ answers, verse, pool: [...pool, verse], seed: `s${i}` })!;
      expect(ex.options).not.toContain(verse);
    }
  });

  it('draws its wrong options from the reader passages given, before the well-known fallback', () => {
    const ex = buildVerseCrossref({ answers, verse, pool, seed: 'a' })!;
    const wrong = ex.options.filter((option) => !answers.includes(option));
    for (const option of wrong) expect(pool).toContain(option);
  });

  it('tops up from well-known verses for a reader with little on file', () => {
    const ex = buildVerseCrossref({ answers, verse, pool: [], seed: 'a' })!;
    expect(ex.options).toHaveLength(4);
  });

  it('refuses a verse the index carries no cross-reference for', () => {
    expect(buildVerseCrossref({ answers: [], verse, pool, seed: 'a' })).toBeNull();
  });
});
