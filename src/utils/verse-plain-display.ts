/**
 * Plain-text verse display helpers. fetchVerseText HTML uses <sup>n</sup> before verse copy;
 * stripping tags leaves a leading numeral (e.g. "16 For God…") which we remove for card UI.
 */

/**
 * Strip HTML for VOTD card plain text. Preserves line breaks from &lt;br&gt; and paragraph
 * boundaries so the card can use white-space: pre-wrap and avoid a one-line→wrapped jump.
 */
export function stripHtmlPreservingBreaksForVotd(html: string): string {
  if (!html) return '';
  let s = html
    .replace(/\r\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<p[^>]*>/gi, '');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/[^\S\n]+/g, ' ');
  s = s
    .split('\n')
    .map((line) => line.trim())
    .join('\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

/**
 * After HTML→plain, drop a leading verse number that matches the reference's start verse.
 * Only applies to a single verse (no range). Safe no-op when verse is unknown or text unchanged.
 */
export function stripLeadingVerseNumberFromPlainText(
  plain: string,
  verse: number | null | undefined,
  verseEnd: number | null | undefined,
): string {
  if (verse == null || plain.length === 0) return plain;
  if (verseEnd != null && verseEnd !== verse) return plain;

  const head = plain.trim();
  const v = verse;
  // Optional opening quotes, verse numeral, then whitespace / quote / start of prose letter
  const re = new RegExp(`^(?:["'“”‘’]\\s*)*${v}(?:\\s+|["'“”‘’]+|(?=[A-Za-z]))`);
  const stripped = head.replace(re, '').trim();
  if (stripped.length === 0) return head;
  if (stripped.length < head.length) return stripped;
  return plain;
}

/** Opening run: spaces + straight/curly quotes (source often includes “ before prose). */
const LEADING_QUOTES = /^[\s"'“”‘’]+/u;
/**
 * Closing run: only "double" style marks + spaces — avoids eating a possessive apostrophe (sons')
 * at end of string.
 */
const TRAILING_CLOSING_QUOTES = /[\s"\u201c\u201d]+$/u;

/**
 * VOTD card wraps the line in typographic &ldquo;/&rdquo;; strip quotes already present in source
 * plain text so we do not show doubled opens/closes (e.g. ““For…”).
 */
export function stripRedundantEdgeQuotesForVotdCard(plain: string): string {
  let s = plain.trim();
  s = s.replace(LEADING_QUOTES, '').replace(TRAILING_CLOSING_QUOTES, '').trim();
  return s;
}
