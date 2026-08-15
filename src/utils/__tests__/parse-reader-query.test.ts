import { describe, it, expect } from 'vitest';
import { parseReaderQuery } from '../parse-reader-query';

describe('parseReaderQuery', () => {
  it('reads a book and chapter', () => {
    expect(parseReaderQuery('John 3')).toMatchObject({
      book: 'John',
      chapter: 3,
      verse: null,
      reference: 'John 3',
      chapterAssumed: false,
    });
  });

  it('reads a verse when the query names one', () => {
    expect(parseReaderQuery('John 3:16')).toMatchObject({
      book: 'John',
      chapter: 3,
      verse: 16,
      reference: 'John 3:16',
    });
  });

  it('assumes chapter 1 for a bare book name, and says so', () => {
    expect(parseReaderQuery('Nahum')).toMatchObject({
      book: 'Nahum',
      chapter: 1,
      chapterAssumed: true,
    });
  });

  it('resolves numbered books and abbreviations', () => {
    expect(parseReaderQuery('1 cor 13')).toMatchObject({ book: '1 Corinthians', chapter: 13 });
    expect(parseReaderQuery('rom 8')).toMatchObject({ book: 'Romans', chapter: 8 });
  });

  it('does not resolve Philemon to Philippians', () => {
    expect(parseReaderQuery('philemon')?.book).toBe('Philemon');
  });

  it('treats a bare number in a one-chapter book as a verse', () => {
    expect(parseReaderQuery('Jude 3')).toMatchObject({
      book: 'Jude',
      chapter: 1,
      verse: 3,
      reference: 'Jude 3',
      chapterAssumed: false,
    });
  });

  it('takes the start of a range and drops the rest', () => {
    expect(parseReaderQuery('John 3:16-17')).toMatchObject({
      book: 'John',
      chapter: 3,
      verse: 16,
      reference: 'John 3:16',
    });
    expect(parseReaderQuery('Romans 8-9')).toMatchObject({ book: 'Romans', chapter: 8 });
  });

  it('rejects a chapter the book does not have', () => {
    expect(parseReaderQuery('John 99')).toBeNull();
  });

  it('ignores fragments too short to be meant as a book', () => {
    expect(parseReaderQuery('is')).toBeNull();
    expect(parseReaderQuery('j')).toBeNull();
  });

  it('accepts a short fragment once a chapter declares the intent', () => {
    expect(parseReaderQuery('is 40')).toMatchObject({ book: 'Isaiah', chapter: 40 });
  });

  it('ignores queries that are not references at all', () => {
    expect(parseReaderQuery('')).toBeNull();
    expect(parseReaderQuery('prayer for my sister')).toBeNull();
    expect(parseReaderQuery('42')).toBeNull();
  });
});
