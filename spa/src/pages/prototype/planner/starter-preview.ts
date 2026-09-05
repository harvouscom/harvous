/**
 * A template's shape, as a handful of bars.
 *
 * The starter field used to name a template and stop there, which told a pastor
 * nothing about what they were handing the room — you picked a word and found
 * out what it did when somebody else's note opened. This turns the template into
 * what the appearance picker already does for a theme: a small drawing of the
 * result, sitting next to the choice that produces it.
 *
 * Bars rather than the words themselves. At tile width real text is a grey
 * smudge, and the appearance tiles' own comment makes the same point about
 * typefaces — a preview has to show the thing that differs. Between two
 * templates that is the *shape*: how many prompts, how long, where the headings
 * fall. The name underneath says which one it is.
 */

/** One line of the drawing. `width` is a fraction of the tile, 0–1. */
export type StarterPreviewLine = {
  width: number;
  /** Headings sit heavier, so a shape with sections reads as one. */
  heading: boolean;
};

/** Enough to show a shape; more would only shrink each bar past legibility. */
const MAX_LINES = 5;

/** Blocks shorter than this are the empty paragraphs a template uses as spacing. */
const MIN_CHARS = 2;

/** 28 characters fills the tile — short prompts stay visibly short. */
const FULL_WIDTH_CHARS = 28;

const BLOCK = /<(h[1-6]|p|div|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi;

function plain(inner: string): string {
  return inner
    .replace(/<br\s*\/?>/gi, ' ')
    /* Tags go, including scripture pills — their markup is far longer than the
       reference they render and would read as a full-width line. */
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Matched by block tag rather than split on boundaries, so the tag name is still
 * in hand when each line is measured — splitting first threw away the one bit
 * that tells a heading from a paragraph.
 */
export function starterPreviewLines(html: string | null | undefined): StarterPreviewLine[] {
  if (!html) return [];
  const lines: StarterPreviewLine[] = [];

  for (const match of html.matchAll(BLOCK)) {
    const text = plain(match[2] ?? '');
    if (text.length < MIN_CHARS) continue;
    lines.push({
      width: Math.min(1, Math.max(0.25, text.length / FULL_WIDTH_CHARS)),
      heading: /^h[1-6]$/i.test(match[1] ?? ''),
    });
    if (lines.length === MAX_LINES) break;
  }

  /* A template saved as bare text has no blocks to match. It is still a shape —
     one line — and returning nothing would draw it as an empty page, which is
     the one thing this preview exists to tell apart. */
  if (lines.length === 0) {
    const text = plain(html);
    if (text.length >= MIN_CHARS) {
      lines.push({
        width: Math.min(1, Math.max(0.25, text.length / FULL_WIDTH_CHARS)),
        heading: false,
      });
    }
  }

  return lines;
}
