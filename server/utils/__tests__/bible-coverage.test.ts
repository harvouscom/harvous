import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db', () => ({}));

import { chaptersForReference } from '../bible-coverage';

describe('chaptersForReference', () => {
  it('reads a highlight on one verse as its chapter', () => {
    expect(chaptersForReference('John 15:5')).toEqual([{ book: 'John', chapter: 15 }]);
  });

  it('marks both chapters of a range that crosses them', () => {
    expect(chaptersForReference('Exodus 6:28-7:7')).toEqual([
      { book: 'Exodus', chapter: 6 },
      { book: 'Exodus', chapter: 7 },
    ]);
  });

  it('gives nothing for text that is not a reference', () => {
    expect(chaptersForReference('not a verse')).toEqual([]);
  });
});
