import { describe, it, expect } from 'vitest';
import {
  formatVerseAddress,
  lastVerseOf,
  neighbourVerseAddresses,
  nextVerseAddress,
} from '@/utils/verse-adjacency';

const next = (reference: string) => {
  const address = nextVerseAddress(reference);
  return address ? formatVerseAddress(address) : null;
};

describe('nextVerseAddress', () => {
  it('steps to the next verse', () => {
    expect(next('Romans 1:7')).toBe('Romans 1:8');
    expect(next('John 15:5')).toBe('John 15:6');
  });

  it('rolls into the next chapter at the end of one', () => {
    // Romans 1 has 32 verses. `verse + 1` would invent Romans 1:33.
    expect(next('Romans 1:32')).toBe('Romans 2:1');
    expect(next('Genesis 1:31')).toBe('Genesis 2:1');
  });

  it('stops at the end of a book rather than making a claim about the canon', () => {
    /*
     * Revelation 22:21 into Genesis 1:1 would assert the Bible loops; Malachi 4:6 into Matthew
     * 1:1 would assert a particular canon and ordering. Neither is this file's to say.
     */
    expect(next('Revelation 22:21')).toBeNull();
    expect(next('Malachi 4:6')).toBeNull();
  });

  it('steps a range from its end, not from its start', () => {
    // 15:6 is inside the passage the reader was just shown, so it is not what comes next.
    expect(next('John 15:5-8')).toBe('John 15:9');
  });

  it('says nothing about a reference it cannot read', () => {
    expect(next('')).toBeNull();
    expect(next('Hezekiah 4:2')).toBeNull();
    expect(next('not a reference at all')).toBeNull();
  });
});

describe('lastVerseOf', () => {
  it('is the single verse, the end of a range, or the end of a cross-chapter range', () => {
    expect(lastVerseOf('John 15:5')).toEqual({ book: 'John', chapter: 15, verse: 5 });
    expect(lastVerseOf('John 15:5-8')).toEqual({ book: 'John', chapter: 15, verse: 8 });
  });
});

describe('neighbourVerseAddresses', () => {
  it('draws from the same chapter, so the options sound alike', () => {
    /*
     * The point of the rung. Three verses from other books would test whether the reader
     * recognises the topic, which they would pass without remembering the passage at all.
     */
    const neighbours = neighbourVerseAddresses('John 15:5', 3);
    expect(neighbours).toHaveLength(3);
    for (const n of neighbours) {
      expect(n.book).toBe('John');
      expect(n.chapter).toBe(15);
    }
  });

  it('never offers the verse asked about or the one that answers it', () => {
    const shown = neighbourVerseAddresses('John 15:5', 6).map((v) => v.verse);
    expect(shown).not.toContain(5); // the stem
    expect(shown).not.toContain(6); // the answer
  });

  it('works at the top and bottom of a chapter, where one side runs out', () => {
    expect(neighbourVerseAddresses('John 15:1', 3)).toHaveLength(3);
    expect(neighbourVerseAddresses('Romans 1:32', 3)).toHaveLength(3);
  });

  it('returns nothing rather than guessing for an unreadable reference', () => {
    expect(neighbourVerseAddresses('Hezekiah 4:2', 3)).toEqual([]);
  });
});
