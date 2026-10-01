import { describe, expect, it } from 'vitest';
import { suggestBooksForTypedReference } from '../scripture-book-suggest';

const books = (text: string) => suggestBooksForTypedReference(text)?.books ?? [];

describe('suggestBooksForTypedReference', () => {
  it('offers the book for a prefix the detector does not know', () => {
    expect(books('joh 3:16')).toEqual(['John']);
    expect(books('roma 8:28')).toEqual(['Romans']);
    expect(books('psa 23:1')).toEqual(['Psalms']);
    expect(books('mar 1:1')).toEqual(['Mark']);
  });

  it('reads a numbered book with or without the space', () => {
    expect(books('1 co 13:4')).toEqual(['1 Corinthians']);
    expect(books('1co 13:4')).toEqual(['1 Corinthians']);
    expect(books('1c 13:4')).toEqual(expect.arrayContaining(['1 Corinthians', '1 Chronicles']));
  });

  it('reads a multi-word book', () => {
    expect(books('song 2:1')).toEqual(['Song of Solomon']);
    expect(books('song of sol 2:1')).toEqual(['Song of Solomon']);
  });

  it('tells Philemon from Philippians', () => {
    expect(books('philem 1:6')).toEqual(['Philemon']);
  });

  it('offers every book an ambiguous prefix could be, if the reference exists there', () => {
    expect(books('jud 1:3')).toEqual(expect.arrayContaining(['Judges', 'Jude']));
    // Jude has one chapter; only Judges has a chapter 21.
    expect(books('jud 21:1')).toEqual(['Judges']);
  });

  it('suggests nothing the detector already reads', () => {
    expect(suggestBooksForTypedReference('rom 8:28')).toBeNull();
    expect(suggestBooksForTypedReference('John 3:16')).toBeNull();
    expect(suggestBooksForTypedReference('ps 23')).toBeNull();
  });

  it('suggests nothing for a time that would be an out-of-canon verse', () => {
    expect(suggestBooksForTypedReference('see you am 5:30')).toBeNull();
    expect(suggestBooksForTypedReference('it is 3:00')).toBeNull();
  });

  it('needs at least two letters, or one after a book number', () => {
    expect(suggestBooksForTypedReference('j 3:16')).toBeNull();
  });

  it('needs a chapter after the book', () => {
    expect(suggestBooksForTypedReference('joh')).toBeNull();
    expect(suggestBooksForTypedReference('joh ')).toBeNull();
    expect(suggestBooksForTypedReference('joh3:16')).toBeNull();
  });

  it('finds the book at the end of a sentence and reports where it was typed', () => {
    const text = 'I read joh 3:16';
    const s = suggestBooksForTypedReference(text);
    expect(s).toMatchObject({ typedBook: 'joh', tail: '3:16', books: ['John'] });
    expect(text.slice(s!.bookStart, s!.bookEnd)).toBe('joh');
  });

  it('ignores a trailing dash while a range is being typed', () => {
    expect(books('joh 3:16-')).toEqual(['John']);
    expect(books('joh 3:16-17')).toEqual(['John']);
  });
});
