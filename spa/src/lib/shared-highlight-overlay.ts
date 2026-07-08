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

  if (loc >= 0 && loc + len <= doc.content.size) {
    const pmAsPos = { from: loc, to: loc + len };
    if (snapshot) {
      const pmText = doc.textBetween(pmAsPos.from, pmAsPos.to, '\n').trim();
      if (pmText === snapshot) return pmAsPos;
      if (plainRange) {
        const plainText = doc.textBetween(plainRange.from, plainRange.to, '\n').trim();
        if (plainText === snapshot) return plainRange;
      }
      return plainRange;
    }
    return pmAsPos;
  }

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
