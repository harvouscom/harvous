/**
 * A chapter's text, verse by verse.
 *
 * `fetchVerseText("John 3")` returns the whole chapter as one HTML string with a superscript
 * number in front of each verse — the reader's markup, built for display. The chapter rungs need
 * it as a list: which verse is this, what does it say, how many are there. This is the one place
 * that markup is taken apart, so a change to how verses are rendered has one place to be
 * matched.
 *
 * Pure. The fixture in its test is the exact `verseSpan` shape fetch-verse-text emits.
 */

export interface ChapterVerse {
  number: number;
  /** Plain text, tags stripped, whitespace collapsed. */
  text: string;
}

const VERSE_NUMBER = /<sup class="verse-num"[^>]*>(\d+)<\/sup>/g;

function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split rendered chapter HTML into its verses, in the order the text has them.
 *
 * The count comes from the text, not from the canon table: Psalm 117 has two verses however
 * many a range lookup claims, and a translation missing a verse simply has one fewer. Anything
 * before the first verse number (a chapter heading) is dropped; a verse with no words is
 * dropped too, so callers can index without checking.
 */
export function splitChapterHtmlIntoVerses(html: string): ChapterVerse[] {
  const matches = [...html.matchAll(VERSE_NUMBER)];
  const verses: ChapterVerse[] = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const start = (match.index ?? 0) + match[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? html.length) : html.length;
    const number = Number(match[1]);
    const text = plainText(html.slice(start, end));
    if (!Number.isInteger(number) || number < 1 || !text) continue;
    verses.push({ number, text });
  }
  return verses;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** One verse back in the reader's markup, for a truth payload the dock renders as scripture. */
export function verseHtml(verse: ChapterVerse): string {
  return `<sup class="verse-num" style="font-size:0.55em; line-height:0; vertical-align:super;">${verse.number}</sup>${escapeHtml(verse.text)}`;
}

/** Several verses, in the order given, as one scripture block. */
export function versesHtml(verses: readonly ChapterVerse[]): string {
  return verses.map(verseHtml).join(' ');
}
