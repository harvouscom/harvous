import type { StudyThreadEntryDetail } from '../../hooks/queries/useNote';

type DocLike = {
  content: { size: number };
  textBetween: (from: number, to: number, blockSeparator?: string) => string;
  descendants: (
    f: (
      node: { isText?: boolean; isBlock?: boolean; text?: string; nodeSize: number },
      pos: number,
    ) => boolean | void,
  ) => void;
};

/**
 * Reconstruct the note's plain text using the same block-newline convention as
 * plainTextOffsetToPmRange, so an offset found here maps back through it.
 */
function buildPlainText(doc: DocLike): string {
  let out = '';
  let plainLen = 0;
  doc.descendants((node, _pos) => {
    if (node.isText && node.text) {
      out += node.text;
      plainLen += node.text.length;
      return true;
    }
    if (node.isBlock && plainLen > 0) {
      out += '\n';
      plainLen += 1;
    }
    return true;
  });
  return out;
}

/**
 * Search the doc's plain text for an annotation's snapshot and map the match
 * back to a ProseMirror range. Used to re-anchor a response when the author has
 * edited the body and the stored offset no longer points at the snapshot text.
 * Requires a unique match (an ambiguous snapshot shouldn't jump to the wrong
 * occurrence) — returns null otherwise so the caller can drop the overlay.
 */
export function findSnapshotPmRange(
  doc: DocLike,
  snapshot: string,
): { from: number; to: number } | null {
  const needle = snapshot.trim();
  if (needle.length < 2) return null;
  const haystack = buildPlainText(doc);
  const firstIdx = haystack.indexOf(needle);
  if (firstIdx < 0) return null;
  if (haystack.indexOf(needle, firstIdx + 1) >= 0) return null; // ambiguous — don't guess
  return plainTextOffsetToPmRange(doc, firstIdx, needle.length);
}

/** Map plain-text offset (newline-separated blocks) to a ProseMirror range when possible. */
export function plainTextOffsetToPmRange(
  doc: DocLike,
  offset: number,
  length: number,
): { from: number; to: number } | null {
  if (offset < 0 || length <= 0) return null;
  let plainLen = 0;
  let from: number | null = null;
  let to: number | null = null;
  const endTarget = offset + length;

  doc.descendants((node, pos) => {
    if (from != null && to != null) return false;
    if (node.isText && node.text) {
      const nodeStart = plainLen;
      const nodeEnd = plainLen + node.text.length;
      if (from == null && offset >= nodeStart && offset <= nodeEnd) {
        from = pos + (offset - nodeStart);
      }
      if (from != null && to == null && endTarget >= nodeStart && endTarget <= nodeEnd) {
        to = pos + (endTarget - nodeStart);
      }
      plainLen = nodeEnd;
      return true;
    }
    if (node.isBlock && plainLen > 0) {
      plainLen += 1;
    }
    return true;
  });

  if (from != null && to == null) {
    to = Math.min(from + length, doc.content.size);
  }
  if (from == null || to == null || from >= to) return null;
  return { from, to };
}

export function resolveStudyThreadPmRange(
  doc: DocLike,
  entry: Pick<StudyThreadEntryDetail, 'anchorLocation' | 'anchorLength' | 'anchorTextSnapshot' | 'sourceSnippet'>,
): { from: number; to: number } | null {
  const loc = entry.anchorLocation;
  const len = entry.anchorLength;
  if (loc == null || len == null || len <= 0) return null;

  const snapshot = (entry.anchorTextSnapshot ?? entry.sourceSnippet ?? '').trim();
  const plainRange = plainTextOffsetToPmRange(doc, loc, len);

  // With a snapshot we can verify which stored interpretation is correct (the
  // anchor columns hold plain-text offsets from overlay-mode creates but raw PM
  // positions from normal-mode creates — see anchor semantics in the dev notes).
  if (snapshot) {
    if (loc >= 0 && loc + len <= doc.content.size) {
      const pmText = doc.textBetween(loc, loc + len, '\n').trim();
      if (pmText === snapshot) return { from: loc, to: loc + len };
    }
    if (plainRange) {
      const plainText = doc.textBetween(plainRange.from, plainRange.to, '\n').trim();
      if (plainText === snapshot) return plainRange;
    }
    // Neither offset matches — the author edited the body. Re-anchor by finding
    // the snapshot text rather than painting the overlay on the wrong words;
    // drop it (return null) when the snapshot is gone or ambiguous.
    return findSnapshotPmRange(doc, snapshot);
  }

  // No snapshot (legacy rows): best-effort, prefer the raw-PM interpretation.
  if (loc >= 0 && loc + len <= doc.content.size) return { from: loc, to: loc + len };
  return plainRange;
}

export function filterOverlayStudyThreads(
  studyThreads: StudyThreadEntryDetail[] | undefined,
): StudyThreadEntryDetail[] {
  if (!studyThreads?.length) return [];
  return studyThreads.filter(
    (row) =>
      row.anchorLocation != null &&
      row.anchorLength != null &&
      row.anchorLength > 0,
  );
}

/** Foreign note: author highlights live as in-body marks; overlay is for other members only. */
export function filterForeignNoteOverlayStudyThreads(
  studyThreads: StudyThreadEntryDetail[] | undefined,
  noteAuthorUserId: string | null | undefined,
): StudyThreadEntryDetail[] {
  const anchored = filterOverlayStudyThreads(studyThreads);
  if (!noteAuthorUserId) return anchored;
  return anchored.filter((row) => row.userId !== noteAuthorUserId);
}

export function pmRangesOverlap(
  a: { from: number; to: number },
  b: { from: number; to: number },
): boolean {
  return a.from < b.to && b.from < a.to;
}
