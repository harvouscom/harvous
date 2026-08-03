/**
 * Helpers for note bodies that arrived truncated from a *list* payload.
 *
 * The server caps list content at NOTE_LIST_CONTENT_MAX_CHARS with `left(content, N)`
 * — a byte-exact prefix that usually lands mid-tag. Two consequences the editor has
 * to handle:
 *
 *   1. Such a body must never be saved, or it overwrites the full note.
 *   2. When the full body arrives, the missing text is exactly `full.slice(previewLength)`,
 *      so it can be appended without re-parsing what the user has been typing into.
 *
 * Both depend on the seam being a clean *block* boundary. A raw `left()` cut can slice
 * a tag in half; parsing that into TipTap and later appending the remainder would split
 * an element. Trimming back to the last closing block tag keeps the invariant
 * `preview === full.slice(0, previewLength)` while making both halves parseable.
 */

/** Top-level blocks a TipTap document is a flat sequence of. */
const BLOCK_CLOSE_RE = /<\/(?:p|h[1-6]|blockquote|ul|ol|li|pre|div|figure|table)>/gi;

export type NoteListPreview = {
  /** Body to seed the editor with — a prefix of the stored content. */
  html: string;
  /** Character offset into the stored content where `html` ends. */
  previewLength: number;
  /** False when `html` is the entire stored note (nothing was cut). */
  truncated: boolean;
};

/**
 * Resolve a list payload's `content` + `contentLength` into a safely-seedable body.
 *
 * `contentLength` is the stored length. When it is unknown (older payloads, hand-built
 * seeds) we cannot prove the body is complete, so we report it as not truncated and
 * leave today's behavior — the details fetch still corrects it; we just don't gain the
 * save-blocking guarantee.
 */
export function resolveNoteListPreview(
  content: string | null | undefined,
  contentLength: number | null | undefined,
): NoteListPreview {
  const html = content ?? '';
  if (typeof contentLength !== 'number' || contentLength <= html.length) {
    return { html, previewLength: html.length, truncated: false };
  }

  // Trim back to the end of the last complete block so the seam is parseable.
  let lastBlockEnd = 0;
  BLOCK_CLOSE_RE.lastIndex = 0;
  for (let m = BLOCK_CLOSE_RE.exec(html); m; m = BLOCK_CLOSE_RE.exec(html)) {
    lastBlockEnd = m.index + m[0].length;
  }

  // No complete block in the window — one enormous paragraph. Keep the raw cut: the
  // prefix invariant still holds, so nothing is lost; the seam just isn't pretty.
  if (lastBlockEnd === 0) {
    return { html, previewLength: html.length, truncated: true };
  }

  return {
    html: html.slice(0, lastBlockEnd),
    previewLength: lastBlockEnd,
    truncated: true,
  };
}

/**
 * The text a truncated preview is missing, given the full body that has since loaded.
 * Returns '' when there is nothing to append or the preview isn't actually a prefix of
 * `full` (server-side rewriting between the two fetches — bail rather than duplicate text).
 */
export function noteListPreviewTail(
  full: string | null | undefined,
  preview: string | null | undefined,
  previewLength: number,
): string {
  if (typeof full !== 'string' || typeof preview !== 'string') return '';
  if (previewLength <= 0 || previewLength > full.length) return '';
  if (full.slice(0, previewLength) !== preview) return '';
  return full.slice(previewLength);
}
