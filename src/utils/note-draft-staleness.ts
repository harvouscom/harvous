/**
 * Deciding whether a stored draft is actually *unsaved work*.
 *
 * The draft backstop (`note-draft-store`) restores whenever the stored copy differs from
 * the server copy by an exact HTML string compare. That compare is too literal in two
 * recurring cases, and both surfaced as a false "Restored unsaved changes":
 *
 *   1. Scripture processing runs server-side and wraps plain references in pill markup.
 *      The draft and the server body then hold the *same words* in different HTML, so
 *      the compare says "differs" forever and the draft is restored on every open.
 *   2. A note opened from a list arrives body-truncated. A draft written from that prefix
 *      is a known-incomplete body; restoring it *replaces* the full body, which is what
 *      the user sees as "it came back but only partial".
 *
 * These helpers are pure so the decisions are testable without mounting TipTap.
 */

import { canonicalizeNoteHtmlLineBreaks } from './note-html-linebreaks';
import { stripHtml } from './html-stripper';

const SPAN_TAG_RE = /<span\b[^>]*>|<\/span\s*>/gi;

/**
 * Drop scripture-pill `<span>` wrappers while keeping their text and every other mark.
 *
 * Deliberately narrow: only spans carrying `data-scripture-reference` are unwrapped, and
 * only their tags — bold/italic/highlight survive, so a formatting-only draft still reads
 * as a real edit and gets restored. Depth-tracked rather than regex-paired because a pill
 * can contain nested inline marks, and `<span>.*?</span>` would close on the wrong tag.
 */
export function unwrapScripturePills(html: string): string {
  if (!html || !html.includes('data-scripture-reference')) return html ?? '';
  const stack: boolean[] = [];
  let out = '';
  let cursor = 0;
  SPAN_TAG_RE.lastIndex = 0;
  for (let m = SPAN_TAG_RE.exec(html); m; m = SPAN_TAG_RE.exec(html)) {
    out += html.slice(cursor, m.index);
    cursor = m.index + m[0].length;
    const isClose = m[0][1] === '/';
    if (isClose) {
      // Unbalanced close (shouldn't happen in serialized TipTap output) — keep it as-is
      // rather than guessing, so the compare degrades to "differs" instead of lying.
      const wasPill = stack.length > 0 ? stack.pop() : false;
      if (!wasPill) out += m[0];
      continue;
    }
    const isPill = m[0].includes('data-scripture-reference');
    stack.push(isPill);
    if (!isPill) out += m[0];
  }
  out += html.slice(cursor);
  return out;
}

/** Whitespace between tags is serialization noise, not content. */
function normalizeForCompare(html: string | null | undefined): string {
  const canonical = canonicalizeNoteHtmlLineBreaks(html ?? '');
  return unwrapScripturePills(canonical)
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when two bodies hold the same content once scripture-pill markup is set aside.
 *
 * This is the "does the draft add anything?" test at restore time. Non-pill markup is
 * preserved on purpose — a draft whose only change is bolding a word IS unsaved work.
 */
export function noteHtmlEquivalentIgnoringScripturePills(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return normalizeForCompare(a) === normalizeForCompare(b);
}

function plainForCompare(html: string | null | undefined): string {
  // Unwrap before stripping, not after: stripHtml renders a pill as its reference *plus*
  // the translation abbreviation ("Romans 8:1 NET"), so comparing a pill-ified server body
  // against the plain reference the editor sent would never match — which is the exact
  // case this exists to catch.
  return stripHtml(unwrapScripturePills(html ?? ''), { preserveSpacing: true })
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when two bodies carry the same words, ignoring all markup.
 *
 * Looser than the pill-aware compare above, and used only where the two sides are
 * *expected* to differ structurally: the 409 path, where the server may have rewritten
 * the body wholesale (pills, quote blocks) around text the editor already sent.
 */
export function notePlainTextEquivalent(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return plainForCompare(a) === plainForCompare(b);
}

export type TruncatedDraftRestorePlan =
  /** Draft body plus the tail the server has beyond the draft's seam. */
  | { action: 'restore-merged'; content: string }
  /** Treat as an ordinary draft restore. */
  | { action: 'restore' }
  /** Nothing to recover — drop the draft so it can't come back later. */
  | { action: 'skip-clear' }
  /** Can't resolve it against *this* open; leave it for a later, full one. */
  | { action: 'skip-keep' };

/**
 * What to do with a draft that was written from a truncated (list-preview) body.
 *
 * The seam recorded with the draft (`previewHtml` + `previewLength`) is what makes a merge
 * possible: `full.slice(previewLength)` is exactly the text the draft never had, provided
 * the preview is still a prefix of the full body. When it isn't — the note was rewritten
 * between the two reads — restoring would push a truncated body over the full note, which
 * is the precise data loss the truncation hold exists to prevent. Drop the draft instead.
 */
export function planTruncatedDraftRestore(input: {
  draftContent: string;
  draftPreviewHtml?: string;
  draftPreviewLength?: number;
  serverContent: string;
  /** The body currently on screen is itself a list preview. */
  serverIsTruncated: boolean;
  serverPreviewLength?: number;
}): TruncatedDraftRestorePlan {
  const {
    draftContent,
    draftPreviewHtml,
    draftPreviewLength,
    serverContent,
    serverIsTruncated,
    serverPreviewLength,
  } = input;

  const hasSeam =
    typeof draftPreviewHtml === 'string' &&
    typeof draftPreviewLength === 'number' &&
    draftPreviewLength > 0;

  if (serverIsTruncated) {
    // Same seam: this open is the same shape as the one the draft came from, so the
    // editor's existing preview→full upgrade path handles it exactly like a live session.
    if (hasSeam && draftPreviewLength === serverPreviewLength && draftPreviewHtml === serverContent) {
      return { action: 'restore' };
    }
    return { action: 'skip-keep' };
  }

  if (!hasSeam) {
    // Draft predates seam recording. Without it a merge is impossible, so the only safe
    // read is: if the draft says nothing the full body doesn't already say, drop it.
    return notePlainTextEquivalent(draftContent, serverContent) ||
      plainForCompare(serverContent).startsWith(plainForCompare(draftContent))
      ? { action: 'skip-clear' }
      : { action: 'restore' };
  }

  const seamValid =
    draftPreviewLength <= serverContent.length &&
    serverContent.slice(0, draftPreviewLength) === draftPreviewHtml;
  if (!seamValid) return { action: 'skip-clear' };

  const tail = serverContent.slice(draftPreviewLength);
  return tail ? { action: 'restore-merged', content: draftContent + tail } : { action: 'restore' };
}
