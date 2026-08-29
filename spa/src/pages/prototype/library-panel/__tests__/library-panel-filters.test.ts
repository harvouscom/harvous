/**
 * The testament split, and the off-by-one that makes it worth a test at all.
 *
 * Two book-order conventions live in this codebase: the scripture index counts from 0 and
 * the canon table counts from 1. Mixing them does not throw — it answers for the book next
 * door — so a first pass here filed Matthew under the Old Testament and dropped Genesis out
 * of both halves. These are the boundaries where that shows.
 */
import { describe, expect, it } from 'vitest';
import { canonicalBookOrderMap } from '@/utils/scripture-passage-drill';
import {
  SCRIPTURE_TESTAMENT_OPTIONS,
  scriptureTestamentMatches,
} from '../library-panel-filters';

/** The index's own numbering, so the test cannot drift from the thing it is testing. */
const order = canonicalBookOrderMap();
const at = (book: string) => order.get(book) as number;

describe('the split', () => {
  it('puts the first and last books of the Old Testament in it', () => {
    expect(scriptureTestamentMatches('ot', at('Genesis'))).toBe(true);
    expect(scriptureTestamentMatches('ot', at('Malachi'))).toBe(true);
  });

  it('puts the first and last books of the New Testament in it', () => {
    expect(scriptureTestamentMatches('nt', at('Matthew'))).toBe(true);
    expect(scriptureTestamentMatches('nt', at('Revelation'))).toBe(true);
  });

  it('does not let the seam leak — Malachi and Matthew are on opposite sides', () => {
    // The off-by-one showed here first: Matthew read as a minor prophet.
    expect(scriptureTestamentMatches('nt', at('Malachi'))).toBe(false);
    expect(scriptureTestamentMatches('ot', at('Matthew'))).toBe(false);
  });

  it('keeps Genesis out of the New Testament rather than out of everything', () => {
    // A 0-vs-1 slip made `canonGroupForBookOrder(0)` return null, so Genesis vanished from
    // both halves instead of appearing in one.
    expect(scriptureTestamentMatches('ot', at('Genesis'))).toBe(true);
    expect(scriptureTestamentMatches('nt', at('Genesis'))).toBe(false);
  });
});

describe('All', () => {
  it('holds everything, including a book the canon table does not know', () => {
    expect(scriptureTestamentMatches('all', at('Psalms'))).toBe(true);
    expect(scriptureTestamentMatches('all', 9999)).toBe(true);
  });

  it('is the first option, so the switch opens unnarrowed', () => {
    expect(SCRIPTURE_TESTAMENT_OPTIONS[0]?.id).toBe('all');
  });
});
