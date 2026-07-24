import { isStudyHighlightAccentKey, type StudyHighlightAccentKey } from './study-highlight-accents';

export type StudyThreadRehydrateRow = {
  id: string;
  entryKind?: string;
  entryKindRaw?: string;
  highlightAccentRaw?: string | null;
  sourceSnippet?: string | null;
  anchorTextSnapshot?: string | null;
  focusTitle?: string | null;
  anchorLocation?: number | null;
  anchorLength?: number | null;
  scripturePassageExcerpt?: string | null;
  scripturePassageTranslation?: string | null;
  linkedNoteId?: string | null;
  isArchived?: boolean;
};

type EditorLike = {
  state: {
    doc: {
      content: { size: number };
      textBetween: (from: number, to: number, blockSeparator?: string) => string;
      textContent: string;
      descendants: (
        f: (
          node: { isText: boolean; text?: string; marks: Array<{ type: { name: string }; attrs: Record<string, unknown> }>; nodeSize: number },
          pos: number,
        ) => boolean | void,
      ) => void;
    };
  };
};

function entryKind(row: StudyThreadRehydrateRow): string {
  return row.entryKindRaw ?? row.entryKind ?? 'miniNote';
}

function rowSnippet(row: StudyThreadRehydrateRow): string {
  return (row.sourceSnippet ?? row.anchorTextSnapshot ?? row.focusTitle ?? '').trim();
}

function isPassageOnlyScriptureLink(row: StudyThreadRehydrateRow): boolean {
  const kind = entryKind(row);
  if (kind !== 'scriptureLink') return false;
  const hasPassage =
    (row.scripturePassageExcerpt ?? '').trim() !== '' &&
    (row.scripturePassageTranslation ?? '').trim() !== '';
  const hasBodyAnchors =
    row.anchorLocation != null && row.anchorLength != null && row.anchorLength > 0;
  return hasPassage && !hasBodyAnchors;
}

export function studyThreadEligibleForBodyMarkRehydrate(row: StudyThreadRehydrateRow): boolean {
  if (row.isArchived) return false;
  const kind = entryKind(row);
  if (kind === 'workspace') return false;
  if (isPassageOnlyScriptureLink(row)) return false;

  const snippet = rowSnippet(row);
  const hasAnchors =
    row.anchorLocation != null && row.anchorLength != null && row.anchorLength > 0;

  if (kind === 'miniNote') return hasAnchors || snippet.length > 0;
  if (kind === 'linkedNote') {
    return (
      (row.linkedNoteId ?? '').trim() !== '' &&
      (hasAnchors || snippet.length > 0)
    );
  }
  if (kind === 'reference') {
    return hasAnchors || snippet.length > 0;
  }
  if (kind === 'scriptureLink' && hasAnchors) return true;
  return false;
}

export function studyThreadIdsWithBodyHighlightMarks(editor: EditorLike): Set<string> {
  const ids = new Set<string>();
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const mark of node.marks) {
      if (mark.type.name !== 'highlight') continue;
      const sid = mark.attrs.studyThreadEntryId;
      if (typeof sid === 'string' && sid.trim()) ids.add(sid.trim());
    }
  });
  return ids;
}

function normalizeAccent(raw: string | null | undefined): StudyHighlightAccentKey {
  if (raw && isStudyHighlightAccentKey(raw)) return raw;
  return 'warmAmber';
}

function textIndexToPmRange(
  doc: EditorLike['state']['doc'],
  startIndex: number,
  length: number,
): { from: number; to: number } | null {
  if (length <= 0) return null;
  let charIdx = 0;
  let fromPos: number | null = null;
  let toPos: number | null = null;
  const endIndex = startIndex + length;

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const nodeStart = charIdx;
    const nodeEnd = charIdx + node.text.length;

    if (fromPos === null && startIndex >= nodeStart && startIndex < nodeEnd) {
      fromPos = pos + (startIndex - nodeStart);
    }
    if (fromPos !== null && toPos === null && endIndex > nodeStart && endIndex <= nodeEnd) {
      toPos = pos + (endIndex - nodeStart);
    }
    charIdx = nodeEnd;
  });

  if (fromPos != null && toPos != null && fromPos < toPos) {
    return { from: fromPos, to: toPos };
  }
  return null;
}

function findUniqueSnippetRange(
  doc: EditorLike['state']['doc'],
  snippet: string,
): { from: number; to: number } | null {
  const needle = snippet.trim();
  if (!needle) return null;
  const haystack = doc.textContent;
  const first = haystack.indexOf(needle);
  if (first === -1) return null;
  const second = haystack.indexOf(needle, first + needle.length);
  if (second !== -1) return null;
  return textIndexToPmRange(doc, first, needle.length);
}

function locateRangeForRow(
  doc: EditorLike['state']['doc'],
  row: StudyThreadRehydrateRow,
): { from: number; to: number } | null {
  const snippet = rowSnippet(row);
  const hasAnchors =
    row.anchorLocation != null && row.anchorLength != null && row.anchorLength > 0;

  if (hasAnchors) {
    const from = row.anchorLocation!;
    const to = from + row.anchorLength!;
    try {
      if (from >= 0 && to <= doc.content.size && from < to) {
        const text = doc.textBetween(from, to, '\n').trim();
        if (!snippet || text === snippet || text.includes(snippet)) {
          return { from, to };
        }
      }
    } catch {
      /* try snippet fallback */
    }
  }

  if (snippet) return findUniqueSnippetRange(doc, snippet);
  return null;
}

export function rehydrateMissingBodyHighlightMarks(options: {
  editor: EditorLike;
  studyThreads: StudyThreadRehydrateRow[];
  applyMark: (
    range: { from: number; to: number },
    attrs: {
      color: StudyHighlightAccentKey;
      studyThreadEntryId: string;
      linkedNoteId?: string;
      reference?: string;
    },
  ) => boolean;
}): number {
  const present = studyThreadIdsWithBodyHighlightMarks(options.editor);
  const doc = options.editor.state.doc;
  let applied = 0;

  for (const row of options.studyThreads) {
    if (!row.id || present.has(row.id)) continue;
    if (!studyThreadEligibleForBodyMarkRehydrate(row)) continue;

    const range = locateRangeForRow(doc, row);
    if (!range) continue;

    const kind = entryKind(row);
    const linkedNoteId =
      kind === 'linkedNote' && (row.linkedNoteId ?? '').trim()
        ? row.linkedNoteId!.trim()
        : undefined;
    const reference =
      kind === 'reference' ? rowSnippet(row) || undefined : undefined;

    const ok = options.applyMark(range, {
      color: normalizeAccent(row.highlightAccentRaw),
      studyThreadEntryId: row.id,
      ...(linkedNoteId ? { linkedNoteId } : {}),
      ...(reference ? { reference } : {}),
    });
    if (ok) {
      present.add(row.id);
      applied += 1;
    }
  }

  return applied;
}
