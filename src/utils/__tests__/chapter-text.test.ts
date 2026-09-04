import { describe, it, expect } from 'vitest';
import { splitChapterHtmlIntoVerses, verseHtml, versesHtml } from '@/utils/chapter-text';

/** The exact shape fetch-verse-text's `verseSpan` emits, joined with a space as it joins them. */
const sup = (n: number) =>
  `<sup class="verse-num" style="font-size:0.55em; line-height:0; vertical-align:super;">${n}</sup>`;
const CHAPTER = `${sup(1)}Praise the LORD, all you nations! ${sup(2)}For his loyal love towers over us, &amp; the LORD's faithfulness endures. Praise the LORD!`;

describe('splitChapterHtmlIntoVerses', () => {
  it('takes the reader markup apart into numbered verses, in order', () => {
    expect(splitChapterHtmlIntoVerses(CHAPTER)).toEqual([
      { number: 1, text: 'Praise the LORD, all you nations!' },
      { number: 2, text: "For his loyal love towers over us, & the LORD's faithfulness endures. Praise the LORD!" },
    ]);
  });

  it('counts what the text has, not what a table says', () => {
    // Psalm 117 has two verses; the count is the text's own.
    expect(splitChapterHtmlIntoVerses(CHAPTER)).toHaveLength(2);
    expect(splitChapterHtmlIntoVerses('')).toEqual([]);
    expect(splitChapterHtmlIntoVerses('<p>no verse numbers here</p>')).toEqual([]);
  });

  it('drops a heading before the first number and any verse with no words', () => {
    const html = `<h2>Heading</h2>${sup(1)}<em>Only</em> words ${sup(2)}   ${sup(3)}Third`;
    expect(splitChapterHtmlIntoVerses(html)).toEqual([
      { number: 1, text: 'Only words' },
      { number: 3, text: 'Third' },
    ]);
  });
});

describe('verseHtml', () => {
  it('re-emits a verse in the same markup, escaped', () => {
    const html = verseHtml({ number: 3, text: 'a < b & "c"' });
    expect(html).toMatch(/^<sup class="verse-num"[^>]*>3<\/sup>a &lt; b &amp; &quot;c&quot;$/);
    expect(splitChapterHtmlIntoVerses(versesHtml([{ number: 1, text: 'One' }, { number: 2, text: 'Two' }]))).toEqual([
      { number: 1, text: 'One' },
      { number: 2, text: 'Two' },
    ]);
  });
});
