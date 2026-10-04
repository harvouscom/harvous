import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { respaceFromSource, stripBollsHtml, wordKey } from '../../../scripts/respace-bible-from-bolls';

type Verse = { book: string; chapter: number; verse: number; text: string };
const load = (id: string): Verse[] =>
  JSON.parse(readFileSync(resolve(__dirname, `../../../server/data/bibles/${id}.json`), 'utf-8'));
const text = (id: string, book: string, chapter: number, verse: number) =>
  load(id).find((v) => v.book === book && v.chapter === chapter && v.verse === verse)?.text;

describe('respaceFromSource', () => {
  it('restores the space a stripped <br> took out', () => {
    const source = stripBollsHtml('to be released<br>and prisoners will be freed.<br>');
    expect(respaceFromSource('to be releasedand prisoners will be freed.', source)).toBe(
      'to be released and prisoners will be freed.',
    );
  });

  it('never changes letters: a verse that differs from the source is left alone', () => {
    expect(respaceFromSource('the earth was voidand dark', 'the sky was void and dark')).toBeNull();
  });

  it('leaves a word Bolls split with a tag, like small-cap LORD, joined', () => {
    const source = stripBollsHtml('the L<span>ORD</span> is my shepherd');
    expect(respaceFromSource('the LORD is my shepherd', source, new Set(['lord']))).toBe('the LORD is my shepherd');
  });

  it('keeps local capitalisation and apostrophes', () => {
    expect(respaceFromSource('the Lord’s house', "the LORD's house")).toBe('the Lord’s house');
  });

  it('does not open a gap before closing punctuation or inside a quote', () => {
    expect(respaceFromSource('He said, “Come.”And', 'He said, “Come.” And')).toBe('He said, “Come.” And');
    expect(respaceFromSource('word, next', 'word , next')).toBe('word, next');
  });

  it('restores dashes in list verses only when asked', () => {
    expect(respaceFromSource('Simeon59,300', '[22-23] Simeon — 59,300')).toBeNull();
    expect(respaceFromSource('Simeon59,300', '[22-23] Simeon — 59,300', new Set(), { restoreDashes: true })).toBe(
      'Simeon — 59,300',
    );
  });

  it('keys known words case- and apostrophe-insensitively', () => {
    expect(wordKey('Lord’s')).toBe("lord's");
  });
});

describe('Bible JSON spacing', () => {
  it.each([
    ['NLT', 'Isaiah', 61, 1, 'released and prisoners'],
    ['ESV', 'Genesis', 2, 23, 'bone of my bones and flesh of my flesh'],
    ['NIV', 'Genesis', 3, 14, 'belly and you will eat dust all the days'],
    ['MSG', 'Genesis', 1, 4, 'good and separated light from dark'],
    ['BSB', 'Zechariah', 9, 13, 'My bow and fit it'],
    ['NIV', 'Ezekiel', 19, 7, 'strongholds and devastated'],
    ['NLT', 'Numbers', 1, 22, 'Simeon — 59,300'],
    ['AMP', 'John', 6, 10, 'about 5,000'],
  ])('%s %s %i:%i reads with its spaces', (id, book, chapter, verse, expected) => {
    expect(text(id, book, chapter, verse)).toContain(expected);
  });

  it('leaves the bracket-heavy translations’ brackets alone', () => {
    const count = (id: string) => load(id).reduce((n, v) => n + (v.text.match(/\[/g)?.length ?? 0), 0);
    expect(count('AMP')).toBe(21551);
    expect(count('NASB')).toBe(10229);
    expect(count('CSB')).toBe(7495);
  });
});
