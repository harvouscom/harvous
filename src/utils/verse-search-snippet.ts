/**
 * The verse-search snippet format, shared by the server that writes it and the client that
 * renders it.
 *
 * Each matched word arrives wrapped in two control characters rather than in markup. The client
 * splits on them and draws `<mark>` itself, so verse text never reaches innerHTML — a translation
 * that happened to contain `<b>` could not inject anything, and nothing has to be sanitised.
 */

export const VERSE_MATCH_START = '\u0002';
export const VERSE_MATCH_END = '\u0003';

export type VerseSnippetPart = { text: string; match: boolean };

/** Pure: a snippet as runs of plain and matched text, in order, empty runs dropped. */
export function splitVerseSnippet(snippet: string): VerseSnippetPart[] {
  const parts: VerseSnippetPart[] = [];
  let rest = snippet;
  while (rest.length > 0) {
    const start = rest.indexOf(VERSE_MATCH_START);
    if (start < 0) {
      parts.push({ text: rest, match: false });
      break;
    }
    if (start > 0) parts.push({ text: rest.slice(0, start), match: false });
    const afterStart = rest.slice(start + 1);
    const end = afterStart.indexOf(VERSE_MATCH_END);
    /* An unclosed marker is treated as running to the end rather than dropped: losing the tail
       of a verse would be worse than over-highlighting it. */
    const matched = end < 0 ? afterStart : afterStart.slice(0, end);
    if (matched) parts.push({ text: matched, match: true });
    rest = end < 0 ? '' : afterStart.slice(end + 1);
  }
  /* Two markers back to back with nothing between them draw as one mark, not two touching. */
  return parts.reduce<VerseSnippetPart[]>((merged, part) => {
    const last = merged[merged.length - 1];
    if (last && last.match === part.match) last.text += part.text;
    else merged.push({ ...part });
    return merged;
  }, []);
}

/** Pure: the snippet as plain text, for titles, aria labels and copy. */
export function plainVerseSnippet(snippet: string): string {
  return snippet.split(VERSE_MATCH_START).join('').split(VERSE_MATCH_END).join('');
}
