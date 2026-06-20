import { getMarkRange } from '@tiptap/core';
import { isStudyHighlightAccentKey, type StudyHighlightAccentKey } from './study-highlight-accents';
import { notifyStudyThreadListChanged } from './prototype-study-thread-list-sync';

export type OrphanHighlightMark = {
  from: number;
  to: number;
  snippet: string;
  accent: StudyHighlightAccentKey;
  linkedNoteId: string | null;
  /** Dictionary / Easton's reference word when `entryKind` is `reference`. */
  referenceWord: string | null;
  entryKind: 'miniNote' | 'linkedNote' | 'reference';
};

type HighlightMarkAttrs = {
  color?: string | null;
  studyThreadEntryId?: string | null;
  reference?: string | null;
  linkedNoteId?: string | null;
};

type EditorLike = {
  state: {
    doc: {
      content: { size: number };
      textBetween: (from: number, to: number, blockSeparator?: string) => string;
      resolve: (pos: number) => { pos: number; marks: () => Array<{ type: { name: string }; attrs: HighlightMarkAttrs; eq: (other: unknown) => boolean }> };
      descendants: (f: (node: { isText: boolean; marks: Array<{ type: { name: string }; attrs: HighlightMarkAttrs }>; nodeSize: number }, pos: number) => boolean | void) => void;
    };
  };
  schema: {
    marks: {
      highlight?: { name: string };
    };
  };
};

function isReferenceHighlightAttrs(attrs: HighlightMarkAttrs): boolean {
  if (typeof attrs.reference === 'string' && attrs.reference.trim()) return true;
  return attrs.color === 'referenceHighlight';
}

function normalizeAccent(color: string | null | undefined): StudyHighlightAccentKey {
  if (color && isStudyHighlightAccentKey(color)) return color;
  return 'warmAmber';
}

/** Walk the doc for highlight marks missing `studyThreadEntryId` (list-eligible prose highlights). */
export function collectOrphanHighlightMarks(editor: EditorLike): OrphanHighlightMark[] {
  const markType = editor.schema.marks.highlight;
  if (!markType) return [];

  const doc = editor.state.doc;
  const seen = new Set<string>();
  const out: OrphanHighlightMark[] = [];

  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    for (const mark of node.marks) {
      if (mark.type.name !== markType.name) continue;
      const attrs = mark.attrs;
      if (attrs.studyThreadEntryId) continue;

      const range = getMarkRange(doc.resolve(pos), markType as never);
      if (!range || range.from >= range.to) continue;

      const key = `${range.from}:${range.to}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const snippet = doc.textBetween(range.from, range.to, '\n').trim();
      if (!snippet) continue;

      const linkedNoteId =
        typeof attrs.linkedNoteId === 'string' && attrs.linkedNoteId.trim() ? attrs.linkedNoteId.trim() : null;
      const isReference = isReferenceHighlightAttrs(attrs);
      const referenceWord = isReference
        ? (typeof attrs.reference === 'string' && attrs.reference.trim() ? attrs.reference.trim() : snippet)
        : null;

      out.push({
        from: range.from,
        to: range.to,
        snippet,
        accent: normalizeAccent(attrs.color),
        linkedNoteId: isReference ? null : linkedNoteId,
        referenceWord,
        entryKind: isReference ? 'reference' : linkedNoteId ? 'linkedNote' : 'miniNote',
      });
    }
    return true;
  });

  return out;
}

export async function backfillOrphanHighlights(options: {
  editor: EditorLike;
  sourceNoteId: string;
  spaceId: string;
  applyMark: (
    range: { from: number; to: number },
    attrs: {
      color: StudyHighlightAccentKey;
      studyThreadEntryId: string;
      linkedNoteId?: string;
      reference?: string;
    },
  ) => boolean;
}): Promise<number> {
  const orphans = collectOrphanHighlightMarks(options.editor);
  if (orphans.length === 0) return 0;

  let persisted = 0;
  for (const orphan of orphans) {
    const payload: Record<string, unknown> = {
      entryKind: orphan.entryKind,
      sourceSnippet: orphan.snippet,
      highlightAccentRaw: orphan.accent,
      anchorTextSnapshot: orphan.snippet,
      anchorLocation: orphan.from,
      anchorLength: Math.max(0, orphan.to - orphan.from),
    };
    if (orphan.linkedNoteId) {
      payload.linkedNoteId = orphan.linkedNoteId;
    }
    if (orphan.entryKind === 'reference' && orphan.referenceWord) {
      payload.focusTitle = orphan.referenceWord;
    }

    try {
      const res = await fetch(`/api/notes/${encodeURIComponent(options.sourceNoteId)}/study-threads`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { studyThread?: { id?: string } | null };
      const studyId = data.studyThread?.id;
      if (!studyId) continue;

      const applied = options.applyMark(
        { from: orphan.from, to: orphan.to },
        {
          color: orphan.accent,
          studyThreadEntryId: studyId,
          ...(orphan.linkedNoteId ? { linkedNoteId: orphan.linkedNoteId } : {}),
          ...(orphan.referenceWord ? { reference: orphan.referenceWord } : {}),
        },
      );
      if (applied) persisted += 1;
    } catch {
      /* try next orphan */
    }
  }

  if (persisted > 0) {
    notifyStudyThreadListChanged(options.spaceId, options.sourceNoteId);
  }
  return persisted;
}
