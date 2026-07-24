/**
 * Auto study-thread name from all notes in a connection cluster — folder parity
 * via `suggestPrimaryCollectionFromNote` on combined titles/bodies.
 */

import { stripHtml } from '@/utils/html-stripper';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { suggestPrimaryCollectionFromNote } from '@/utils/bible-study-collection-web';

const CLUSTER_TEXT_CAP = 24_000;

export type StudyThreadSuggestNode = {
  id: string;
  title?: string | null;
  content?: string | null;
  noteType?: string | null;
  resourceTitle?: string | null;
  resourceDescription?: string | null;
  /** ISO string — used for fallback ordering when keyword suggest misses. */
  updatedAt?: string | null;
};

function nodePlainTitle(node: StudyThreadSuggestNode): string {
  if (node.noteType === 'resource' && node.resourceTitle?.trim()) {
    return node.resourceTitle.trim();
  }
  return stripServerAutoUntitledNoteTitleForDisplay(node.title) ?? '';
}

function nodeBodyHtml(node: StudyThreadSuggestNode): string {
  if (node.noteType === 'resource' && node.resourceDescription?.trim()) {
    return node.resourceDescription.trim();
  }
  return node.content ?? '';
}

function buildAggregateText(nodes: StudyThreadSuggestNode[]): { title: string; bodyHtml: string } {
  const titles: string[] = [];
  const bodies: string[] = [];
  for (const n of nodes) {
    const t = nodePlainTitle(n);
    const b = stripHtml(nodeBodyHtml(n));
    if (t) titles.push(t);
    if (b) bodies.push(b);
  }
  const title = titles.join(' · ').slice(0, 2000);
  let bodyHtml = bodies.join('\n\n');
  if (bodyHtml.length > CLUSTER_TEXT_CAP) {
    bodyHtml = bodyHtml.slice(0, CLUSTER_TEXT_CAP);
  }
  return { title, bodyHtml };
}

function displayablePlainTitle(node: StudyThreadSuggestNode): string {
  return nodePlainTitle(node).trim();
}

function fallbackTitle(
  nodes: StudyThreadSuggestNode[],
  repNoteId: string | null | undefined,
): string | null {
  const rep = repNoteId ? nodes.find((n) => n.id === repNoteId) : undefined;
  if (rep) {
    const repTitle = displayablePlainTitle(rep);
    if (repTitle) return repTitle;
  }

  const sorted = [...nodes].sort((a, b) => {
    const ta = a.updatedAt ?? '';
    const tb = b.updatedAt ?? '';
    return tb.localeCompare(ta);
  });
  for (const n of sorted) {
    const t = displayablePlainTitle(n);
    if (t) return t;
  }
  return null;
}

/**
 * Picks the single representative note for a connection cluster (thread name lives on this row).
 * Highest degree wins; ties break by lexicographic note id so list + detail APIs agree.
 */
export function pickStudyThreadRepresentativeNoteId(
  noteIds: Iterable<string>,
  degreeById: ReadonlyMap<string, number> | Record<string, number>,
): string | null {
  const degree = (id: string): number => {
    if (typeof (degreeById as ReadonlyMap<string, number>).get === 'function') {
      return (degreeById as ReadonlyMap<string, number>).get(id) ?? 0;
    }
    return (degreeById as Record<string, number>)[id] ?? 0;
  };

  let best: string | null = null;
  for (const id of noteIds) {
    if (best == null) {
      best = id;
      continue;
    }
    const d = degree(id);
    const bestD = degree(best);
    if (d > bestD || (d === bestD && id.localeCompare(best) < 0)) {
      best = id;
    }
  }
  return best;
}

/**
 * Keyword-based thread name from all connected notes; falls back to rep / recent note title.
 */
export function suggestStudyThreadTitleFromNodes(
  nodes: StudyThreadSuggestNode[],
  repNoteId?: string | null,
): string {
  if (!nodes.length) return 'Thread';

  const { title, bodyHtml } = buildAggregateText(nodes);
  const keyword = suggestPrimaryCollectionFromNote(title, bodyHtml);
  if (keyword?.trim()) return keyword.trim();

  return fallbackTitle(nodes, repNoteId) ?? 'Thread';
}

/**
 * Display thread title: manual override when in manual mode, else auto suggestion.
 */
export function resolveStudyThreadDisplayTitle(args: {
  studyThreadTitle: string | null | undefined;
  studyThreadUserOverride: boolean;
  suggestedTitle: string;
}): string {
  const suggested = args.suggestedTitle.trim() || 'Thread';
  if (args.studyThreadUserOverride) {
    const manual = stripServerAutoUntitledNoteTitleForDisplay(args.studyThreadTitle);
    return manual?.trim() || suggested;
  }
  return suggested;
}
