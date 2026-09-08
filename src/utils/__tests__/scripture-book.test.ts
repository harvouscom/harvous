import { describe, it, expect } from 'vitest';
import { bookOfReference, partitionByBook } from '@/utils/scripture-book';

describe('bookOfReference', () => {
  it('names the book, including numbered ones', () => {
    expect(bookOfReference('John 3:16')).toBe('john');
    expect(bookOfReference('1 John 3:16')).toBe('1 john');
    expect(bookOfReference('Psalm 23')).toBe('psalm');
    expect(bookOfReference('Romans 8:1-4')).toBe('romans');
  });

  it('leaves a non-reference alone', () => {
    expect(bookOfReference('Adoption, not slavery')).toBe('adoption, not slavery');
    expect(bookOfReference('')).toBe('');
  });
});

describe('partitionByBook', () => {
  it('puts same-book references first', () => {
    const { close, rest } = partitionByBook(
      ['John 3:16'],
      ['John 1:1', 'Romans 8:15', 'John 15:5', 'Ephesians 2:8'],
    );
    expect(close).toEqual(['John 1:1', 'John 15:5']);
    expect(rest).toEqual(['Romans 8:15', 'Ephesians 2:8']);
  });

  it('treats several anchors as one neighbourhood', () => {
    const { close, rest } = partitionByBook(
      ['John 3:16', 'Romans 8:1'],
      ['John 1:1', 'Romans 5:8', 'Psalm 23:1'],
    );
    expect(close).toEqual(['John 1:1', 'Romans 5:8']);
    expect(rest).toEqual(['Psalm 23:1']);
  });
});
