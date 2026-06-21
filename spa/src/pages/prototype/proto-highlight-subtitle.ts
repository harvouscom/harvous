import type { IconName } from '@/components/react/Icon';
import type { StudyThreadEntryDetail } from '../../hooks/queries/useNote';

const HIGHLIGHT_LIST_TITLE_MAX = 120;

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function truncateHighlightListTitle(s: string): string {
  const t = collapseWhitespace(s);
  if (t.length <= HIGHLIGHT_LIST_TITLE_MAX) return t;
  return `${t.slice(0, HIGHLIGHT_LIST_TITLE_MAX - 1).trimEnd()}…`;
}

export function isScripturePassageHighlightRow(row: Pick<StudyThreadEntryDetail, 'entryKind' | 'scripturePassageExcerpt' | 'scripturePassageTranslation'>): boolean {
  if (row.entryKind !== 'scriptureLink') return false;
  const excerpt = (row.scripturePassageExcerpt ?? '').trim();
  const trans = (row.scripturePassageTranslation ?? '').trim();
  return excerpt.length > 0 && trans.length > 0;
}

/**
 * Primary line for the Highlights sidebar list: prefer the actual anchored selection text,
 * then legacy snippet / user focus title.
 */
export function prototypeHighlightListTitle(row: StudyThreadEntryDetail): string {
  if (isScripturePassageHighlightRow(row)) {
    const excerpt = (row.scripturePassageExcerpt ?? '').trim();
    const ref = (row.scriptureReference ?? '').trim();
    const head = excerpt || ref;
    if (head) return truncateHighlightListTitle(head);
    const ft = (row.focusTitle ?? '').trim();
    return ft ? truncateHighlightListTitle(ft) : 'Highlight';
  }

  const anchor = (row.anchorTextSnapshot ?? '').trim();
  if (anchor) return truncateHighlightListTitle(anchor);

  const snippet = (row.sourceSnippet ?? '').trim();
  if (snippet) return truncateHighlightListTitle(snippet);

  const focus = (row.focusTitle ?? '').trim();
  if (focus) return truncateHighlightListTitle(focus);

  const mini = (row.miniNoteBody ?? '').trim();
  if (mini) return truncateHighlightListTitle(mini);

  return 'Highlight';
}

/** Mirrors native `StudyHighlightListIndex.subtitlePreview`. */
export function prototypeHighlightSubtitlePreview(row: StudyThreadEntryDetail, parentNoteTitle: string): string {
  const from = parentNoteTitle.trim();
  if (isScripturePassageHighlightRow(row)) {
    const ref = (row.scriptureReference ?? '').trim();
    const excerpt = (row.scripturePassageExcerpt ?? '').trim();
    const ann = (row.miniNoteBody ?? '').trim();
    const parts: string[] = [];
    if (ref) parts.push(ref);
    if (excerpt) {
      parts.push(excerpt.length > 120 ? `${excerpt.slice(0, 120)}…` : excerpt);
    }
    if (ann) parts.push(ann);
    const head = parts.join(' · ');
    if (!head) return from ? `From ${from}` : 'Scripture highlight';
    return from ? `${head} — ${from}` : head;
  }

  // Reference highlights (dictionary word saved from a scripture passage): the title already shows
  // the word, so the subtitle surfaces just the source scripture reference it came from — not the
  // note title, which typically repeats the word.
  if (row.entryKind === 'reference') {
    const ref = (row.scriptureReference ?? '').trim();
    if (ref) return ref;
    return from ? `From ${from}` : 'Reference';
  }

  const ann = (row.miniNoteBody ?? '').trim();
  if (ann) return ann;
  const anchor = (row.anchorTextSnapshot ?? '').trim();
  const snap = (row.sourceSnippet ?? '').trim();
  if (snap && snap !== anchor) return snap;
  if (!from) return 'Highlight';
  return from;
}

export function prototypeHighlightRecencyIso(row: StudyThreadEntryDetail): string | null {
  return row.highlightListEditedAt ?? row.updatedAt ?? row.createdAt ?? null;
}

/** Icon for Highlights list rows — native `StudyHighlightFeedRow.kindGlyphAsset`. */
export function highlightEntryKindIconName(entryKind: string | null | undefined): IconName {
  switch (entryKind) {
    case 'linkedNote':
      return 'arrow-right-arrow-left';
    case 'scriptureLink':
      return 'book-open';
    case 'reference':
      return 'lines-leaning';
    case 'workspace':
    case 'miniNote':
    default:
      return 'note-sticky';
  }
}

export function highlightEntryKindAriaLabel(entryKind: string | null | undefined): string {
  switch (entryKind) {
    case 'linkedNote':
      return 'Connected highlight';
    case 'scriptureLink':
      return 'Scripture highlight';
    case 'reference':
      return 'Reference highlight';
    case 'miniNote':
      return 'Note highlight';
    case 'workspace':
      return 'Highlight';
    default:
      return 'Highlight';
  }
}
