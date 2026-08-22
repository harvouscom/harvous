/**
 * The discriminator that lets two different phrases in one verse be two highlights.
 *
 * A reader highlight is looked up by `(userId, parentNoteId IS NULL, entryKind, reference,
 * translation)` and re-highlighting the same reference recolours the existing row rather than
 * inserting — a highlight is a property of a passage, not an event. That key is verse-granular,
 * so two phrases inside one verse would collide into one row. This is the field that separates
 * them.
 *
 * ── Why not the excerpt itself ──
 *
 * The obvious move is to add `scripturePassageExcerpt` to the key, and it is wrong. That column
 * holds the *rendered text* of the passage, so keying on it makes the key depend on Bible text
 * that can change: one punctuation fix in a translation JSON and the lookup stops matching, so
 * re-highlighting inserts a duplicate instead of recolouring — silently, which is exactly the
 * failure the upsert exists to prevent. The excerpt is a good way to paint a highlight and a poor
 * primary key.
 *
 * ── Why null for a whole verse ──
 *
 * A whole-verse highlight stores `null`, which is what every row written before this existed
 * already effectively is. That is what makes this a no-backfill change: existing rows are already
 * correct, and their lookup gains `IS NULL`, which they all satisfy. Whole-verse behaviour is
 * bit-for-bit what it was.
 *
 * ── What normalisation buys, and what it does not ──
 *
 * Lowercased with whitespace collapsed, so the key survives the common shape of a translation
 * correction — a double space, a line-break difference, a capitalisation fix. It does NOT survive
 * a real wording or punctuation change; that highlight would re-add rather than recolour. Judged
 * acceptable for a span that only exists because someone dragged across it, and deliberately not
 * paid for with character offsets, which is a third anchoring model two shipped platforms already
 * decline to use.
 */

/** Collapse to the form the hash is taken of. Exported for tests and for debugging a mismatch. */
export function normalizeSpanText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * djb2, hex, prefixed.
 *
 * Same hash the series accent uses (`seriesAccent` in church-services.ts) and for the same
 * reason: short, stable, dependency-free, and order-sensitive so two spans made of the same words
 * in a different order do not collide. Collision resistance does not need to be cryptographic —
 * the key is only ever compared within one user's rows for one verse reference.
 *
 * Prefixed with `s:` so a value read out of the database is recognisable as a span key rather
 * than mistaken for an id, and so the scheme can be versioned later without ambiguity.
 */
export function scriptureSpanKey(excerpt: string): string {
  const normalized = normalizeSpanText(excerpt);
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash + normalized.charCodeAt(i)) | 0;
  }
  return `s:${(hash >>> 0).toString(16)}`;
}

/**
 * The span key for a selection, or `null` when the selection is the whole passage.
 *
 * A drag that happens to cover exactly one verse is stored as a whole-verse highlight — the same
 * row a tap would have written. Without this the two gestures produce duplicate rows over
 * identical text that nobody could tell apart, which is the duplicate-row failure the upsert
 * exists to prevent arriving through the front door instead of the back.
 *
 * Compared on the normalised form so trailing whitespace or a stray newline in either string does
 * not make a whole-verse drag look like a partial one.
 */
export function spanKeyForSelection(
  selectedText: string,
  fullPassageText: string,
): string | null {
  const selected = normalizeSpanText(selectedText);
  if (!selected) return null;
  if (selected === normalizeSpanText(fullPassageText)) return null;
  return scriptureSpanKey(selected);
}
