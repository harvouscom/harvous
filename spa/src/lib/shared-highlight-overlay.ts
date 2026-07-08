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
  entry: Pick<StudyThreadEntryDetail, 'anchorLocation' | 'anchorLength'>,
): { from: number; to: number } | null {
  const loc = entry.anchorLocation;
  const len = entry.anchorLength;
  if (loc == null || len == null || len <= 0) return null;

  if (loc >= 0 && loc + len <= doc.content.size) {
    return { from: loc, to: loc + len };
  }

  return plainTextOffsetToPmRange(doc, loc, len);
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
