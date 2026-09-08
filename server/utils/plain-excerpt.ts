/**
 * Verse numbers, which the stored verse HTML carries as `<sup class="verse-num">7</sup>`.
 *
 * Dropped whole rather than converted, because a notification body has no superscript: left
 * in, a two-verse reading renders as "6 Seek the Lord… 7 The wicked…", which reads as broken
 * text on a lock screen rather than as Scripture. The in-app verse card hides them the same
 * way, with styling it has room for.
 */
const VERSE_NUMBER_SUP = /<sup\b[^>]*>.*?<\/sup>/gis;

/**
 * Strip HTML to a short plain-text excerpt.
 *
 * Trims at a word boundary rather than mid-word: this feeds notification bodies, where
 * "For God so loved the wor…" reads as a bug and "For God so loved the world…" reads as
 * a quote. Falls back to a hard cut only when there is no space to break on.
 */
export function plainExcerpt(html: string, max = 120): string {
  const text = html
    .replace(VERSE_NUMBER_SUP, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);

  /*
   * Prefer a whole sentence.
   *
   * A quote cut to the character budget lands wherever it lands — "…while he is nearby! The…"
   * ends on a dangling article, which reads as a truncated string rather than as Scripture.
   * When a sentence ends inside the budget and is not merely the first few words, stopping
   * there gives a complete thought and needs no ellipsis at all.
   */
  const sentenceEnd = lastSentenceEnd(cut);
  if (sentenceEnd > max * 0.5) return cut.slice(0, sentenceEnd + 1).trim();

  const lastSpace = cut.lastIndexOf(' ');
  const head = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${head.replace(/[\s,;:.]+$/, '')}…`;
}

/** Index of the last `.`/`!`/`?` that actually closes a sentence, or -1. */
function lastSentenceEnd(text: string): number {
  for (let i = text.length - 1; i >= 0; i -= 1) {
    const char = text[i];
    if (char !== '.' && char !== '!' && char !== '?') continue;
    const next = text[i + 1];
    // End of the slice, or followed by a space — an abbreviation's period ("Dr. Luke") or a
    // decimal point is followed by a letter or digit and is not a sentence end.
    if (next === undefined || next === ' ') return i;
  }
  return -1;
}
