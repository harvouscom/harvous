/**
 * Two translations, one chapter, row by row.
 *
 * The cases that matter are the ones where the versions disagree about what exists — that is
 * the whole reason this is not a `zip`, and a bug here slides one column against the other for
 * the rest of the chapter without looking broken.
 */
import { describe, expect, it } from 'vitest';
import { alignChapterVerses, missingVerseCount } from '../compare-chapter-alignment';

const v = (number: number, text: string) => ({ number, text });

describe('alignChapterVerses', () => {
  it('pairs verses that both translations have', () => {
    expect(alignChapterVerses([v(1, 'a1'), v(2, 'a2')], [v(1, 'b1'), v(2, 'b2')])).toEqual([
      { verse: 1, left: 'a1', right: 'b1' },
      { verse: 2, left: 'a2', right: 'b2' },
    ]);
  });

  it('leaves a gap rather than sliding the columns', () => {
    /*
     * The load-bearing case. The right side has no verse 2; a `zip` would put its verse 3
     * beside the left's verse 2 and every row after would be off by one, silently.
     */
    const rows = alignChapterVerses(
      [v(1, 'a1'), v(2, 'a2'), v(3, 'a3')],
      [v(1, 'b1'), v(3, 'b3')],
    );
    expect(rows).toEqual([
      { verse: 1, left: 'a1', right: 'b1' },
      { verse: 2, left: 'a2', right: null },
      { verse: 3, left: 'a3', right: 'b3' },
    ]);
  });

  it('keeps a verse only one side has', () => {
    const rows = alignChapterVerses([v(1, 'a1')], [v(1, 'b1'), v(2, 'b2')]);
    expect(rows).toEqual([
      { verse: 1, left: 'a1', right: 'b1' },
      { verse: 2, left: null, right: 'b2' },
    ]);
  });

  it('sorts by verse number, whatever order the payload arrived in', () => {
    const rows = alignChapterVerses([v(3, 'a3'), v(1, 'a1')], [v(2, 'b2')]);
    expect(rows.map((r) => r.verse)).toEqual([1, 2, 3]);
  });

  it('ignores entries that are not verse numbers', () => {
    const rows = alignChapterVerses(
      [v(0, 'zero'), v(-1, 'neg'), { number: 1.5, text: 'frac' }, v(1, 'a1')],
      [v(1, 'b1')],
    );
    expect(rows).toEqual([{ verse: 1, left: 'a1', right: 'b1' }]);
  });

  it('takes the first of a duplicated number', () => {
    /* A repeat is malformed, not meaningful; the later one would show a verse's second half
       with no sign the first existed. */
    const rows = alignChapterVerses([v(1, 'first'), v(1, 'second')], []);
    expect(rows).toEqual([{ verse: 1, left: 'first', right: null }]);
  });

  it('handles one side being absent entirely', () => {
    /* A translation that does not carry this chapter at all. The caller decides whether that
       is worth a column of gaps or its own empty state — this just reports it truthfully. */
    const rows = alignChapterVerses([v(1, 'a1'), v(2, 'a2')], []);
    expect(rows.every((r) => r.right === null)).toBe(true);
    expect(alignChapterVerses([], [])).toEqual([]);
  });
});

describe('missingVerseCount', () => {
  it('counts the gaps on each side', () => {
    const rows = alignChapterVerses([v(1, 'a1'), v(2, 'a2')], [v(2, 'b2'), v(3, 'b3')]);
    expect(missingVerseCount(rows)).toEqual({ left: 1, right: 1 });
  });

  it('is zero when the versions agree', () => {
    expect(missingVerseCount(alignChapterVerses([v(1, 'a')], [v(1, 'b')]))).toEqual({
      left: 0,
      right: 0,
    });
  });
});
