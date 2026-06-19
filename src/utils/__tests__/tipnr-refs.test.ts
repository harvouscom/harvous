import { describe, expect, it } from 'vitest';
import { TIPNR_BOOK, parseTipnrRefs } from '../tipnr-refs';

const asStrings = (refs: ReturnType<typeof parseTipnrRefs>) =>
  refs.map((r) => `${r.book} ${r.chapter}:${r.verse}`);

describe('TIPNR_BOOK', () => {
  it('covers 66 books and distinguishes Jude from Judges', () => {
    expect(Object.keys(TIPNR_BOOK)).toHaveLength(66);
    expect(TIPNR_BOOK.Jud).toBe('Jude');
    expect(TIPNR_BOOK.Jdg).toBe('Judges');
    expect(TIPNR_BOOK.Jhn).toBe('John');
    expect(TIPNR_BOOK.Sng).toBe('Song of Solomon');
  });
});

describe('parseTipnrRefs', () => {
  it("expands Aaron's reference pattern with book/chapter inheritance", () => {
    const out = asStrings(parseTipnrRefs('Exo.4.14; Exo.4.27ff; 5.1ff; 7; 9.8,27'));
    expect(out).toContain('Exodus 4:14');
    expect(out).toContain('Exodus 4:27'); // ff anchored at 27
    expect(out).toContain('Exodus 5:1'); // book inherited
    expect(out).toContain('Exodus 7:1'); // whole chapter → verse 1
    expect(out).toContain('Exodus 9:8');
    expect(out).toContain('Exodus 9:27'); // comma verse in current chapter
  });

  it('inherits the book across chapter.verse tokens', () => {
    expect(asStrings(parseTipnrRefs('1Sa.16.1; 17.12'))).toEqual(['1 Samuel 16:1', '1 Samuel 17:12']);
  });

  it('expands a short same-chapter numeric range', () => {
    expect(asStrings(parseTipnrRefs('Gen.5.1-3'))).toEqual(['Genesis 5:1', 'Genesis 5:2', 'Genesis 5:3']);
  });

  it('skips unknown books and out-of-range verses, dedupes repeats', () => {
    expect(asStrings(parseTipnrRefs('Zzz.1.1; Gen.1.1; Gen.1.1; Gen.99.1'))).toEqual(['Genesis 1:1']);
  });

  it('strips editorial suffixes', () => {
    expect(asStrings(parseTipnrRefs('Gen.38.30(a); Mat.1.1(?)'))).toEqual(['Genesis 38:30', 'Matthew 1:1']);
  });
});
