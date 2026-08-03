/**
 * Backstop against a *list-preview* note body being persisted as the note body.
 *
 * List payloads truncate content server-side (`NOTE_LIST_SELECT` in
 * server/utils/dashboard-data.ts uses `left(content, NOTE_LIST_CONTENT_MAX_CHARS)`).
 * Clients that resend a body read from a list row — metadata-only folder ops were
 * the deterministic case — would overwrite the full note with that prefix.
 * `expectedVersion` does not catch it: the version is current, only the body is stale.
 *
 * This detects the *raw passthrough* shape only: the incoming body is byte-for-byte
 * the `left()` prefix. It deliberately does NOT catch a truncated body that went
 * through TipTap, because re-serialization breaks prefix equality — that case is
 * handled client-side by holding the save until the full body arrives.
 */

/** A `left()` cut lands mid-tag; a real TipTap body always ends on `>`. */
export function endsWithTagBoundary(html: string): boolean {
  return />\s*$/.test(html);
}

/**
 * True when `incoming` is exactly the `left(stored, maxChars)` prefix of `stored`
 * — i.e. a list-preview body being written back over the full note.
 *
 * Requires an exact length match rather than `<= maxChars` so an ordinary edit that
 * happens to shorten a note can never trip it. The residual false positive (a user
 * deletes a trailing paragraph and lands on exactly `maxChars` characters) is why
 * callers must resolve this non-destructively — keep the stored body, apply the
 * metadata — rather than rejecting the request.
 */
export function isRawListPreviewWrite(
  incoming: string | null | undefined,
  stored: string | null | undefined,
  maxChars: number,
): boolean {
  if (typeof incoming !== 'string' || typeof stored !== 'string') return false;
  if (incoming.length !== maxChars) return false;
  if (stored.length <= maxChars) return false;
  return stored.startsWith(incoming);
}

/**
 * Log-only signal for a large unexplained body shrink. Never blocks a write — it
 * exists so the truncation paths this guard *can't* catch are still observable.
 */
export function isSuspiciousNoteShrink(
  incoming: string | null | undefined,
  stored: string | null | undefined,
  minStoredLength = 4000,
): boolean {
  if (typeof incoming !== 'string' || typeof stored !== 'string') return false;
  if (stored.length <= minStoredLength) return false;
  return incoming.length < stored.length * 0.5;
}
