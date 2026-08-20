import { describe, it, expect } from 'vitest';
import { stripHtml } from '../html-stripper';
import { passagePlainTextFromVerseHtml } from '../sync-scripture-quotes-for-pill';

/**
 * Verse text is emitted as `<sup class="verse-num">16</sup>For God…` — the gap is CSS, not a
 * character — so flattening it to plain text used to run the number into the first word.
 */
describe('stripHtml — verse numbers', () => {
  const verseHtml =
    '<sup class="verse-num" style="vertical-align:super">16</sup>For God so loved the world. ' +
    '<sup class="verse-num" style="vertical-align:super">17</sup>For God did not send his Son';

  it('separates the verse number from the verse, preserving spacing', () => {
    expect(stripHtml(verseHtml, { preserveSpacing: true })).toBe(
      '16 For God so loved the world. 17 For God did not send his Son',
    );
  });

  it('separates it on the simple path too', () => {
    expect(stripHtml(verseHtml)).toContain('16 For God so loved');
  });

  it('does not split a word wrapped in inline formatting', () => {
    expect(stripHtml('un<b>der</b>stand', { preserveSpacing: true })).toBe('understand');
  });

  it('does not double a space that is already there', () => {
    expect(stripHtml('<sup>16</sup> For God', { preserveSpacing: true })).toBe('16 For God');
  });
});

describe('passagePlainTextFromVerseHtml', () => {
  // This is the live path: it rewrites a scripture quote's body whenever the pill's
  // reference, translation or accent changes, which is why quotes read correctly when
  // inserted and turned conjoined only later.
  it('keeps verse numbers off the front of the verse', () => {
    expect(passagePlainTextFromVerseHtml('<sup class="verse-num">1</sup>In the beginning')).toBe(
      '1 In the beginning',
    );
  });
});
