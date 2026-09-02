import { useLayoutEffect, useState } from 'react';
import { isStudyHighlightAccentKey, studyDockAccentCssVar } from '@/utils/study-highlight-accents';
import type { StudyThreadEntryDetail } from '../../hooks/queries/useNote';
import {
  filterOverlayStudyThreads,
  pmRangesOverlap,
  resolveStudyThreadPmRange,
} from '../../lib/shared-highlight-overlay';
import { highlightEntryKindAriaLabel } from './proto-highlight-subtitle';

const OVERLAY_COORD_MAX_ATTEMPTS = 120;

type EditorLike = {
  view?: {
    coordsAtPos: (pos: number) => { top: number; left: number; bottom: number; right: number };
  };
  state: { doc: Parameters<typeof resolveStudyThreadPmRange>[0] };
};

export type SharedHighlightOverlayRect = {
  id: string;
  /**
   * Every response anchored to this span, **oldest first** — for the dock
   * carousel, which steps through them as the conversation they are.
   */
  entryIds: string[];
  top: number;
  left: number;
  width: number;
  height: number;
  accent: string;
  authorDisplayName?: string;
  entryKind: string;
  quote?: string;
  /** Number of distinct authors stacked on this anchor (for the count badge). */
  authorCount: number;
};

function compactAccessibleQuote(value: string | null | undefined): string | undefined {
  const quote = value?.replace(/\s+/g, ' ').trim();
  if (!quote) return undefined;
  return quote.length > 140 ? `${quote.slice(0, 139).trimEnd()}…` : quote;
}

export function sharedHighlightOverlayButtonLabel(
  rect: Pick<SharedHighlightOverlayRect, 'authorCount' | 'authorDisplayName' | 'entryIds' | 'entryKind' | 'quote'>,
): string {
  const kind = highlightEntryKindAriaLabel(rect.entryKind);
  const actor =
    rect.authorCount > 1 ? `${rect.authorCount} people` : rect.authorDisplayName?.trim() || 'a space member';
  const quote = compactAccessibleQuote(rect.quote);
  const responseCount = rect.entryIds.length;
  return [
    `Open ${kind.toLowerCase()} by ${actor}${quote ? ` on “${quote}”` : ''}`,
    responseCount > 1 ? `${responseCount} responses share this passage` : null,
  ]
    .filter(Boolean)
    .join('. ');
}

export default function SharedStudyHighlightOverlay({
  editor,
  containerEl,
  studyThreads,
  layoutRevision = '',
  onSelectEntry,
}: {
  editor: EditorLike | null;
  containerEl: HTMLElement | null;
  studyThreads: StudyThreadEntryDetail[] | undefined;
  /** Bumps when note body or thread list changes so rects recompute after editor hydrate. */
  layoutRevision?: string;
  onSelectEntry?: (entryId: string, anchorEntryIds?: string[]) => void;
}) {
  const [rects, setRects] = useState<SharedHighlightOverlayRect[]>([]);

  useLayoutEffect(() => {
    if (!editor?.view || !containerEl) {
      setRects([]);
      return;
    }

    let cancelled = false;
    let rafId = 0;

    const computeRects = (): SharedHighlightOverlayRect[] => {
      const overlayEntries = filterOverlayStudyThreads(studyThreads);

      // Resolve every entry to a PM range first, then group entries whose ranges
      // overlap onto a single anchor. Otherwise two responses on the same span
      // render as identical stacked buttons where only the top one is clickable.
      type Resolved = { entry: StudyThreadEntryDetail; range: { from: number; to: number } };
      const resolved: Resolved[] = [];
      for (const entry of overlayEntries) {
        const range = resolveStudyThreadPmRange(editor.state.doc, entry);
        if (range) resolved.push({ entry, range });
      }

      const groups: Resolved[][] = [];
      for (const item of resolved) {
        const group = groups.find((g) => g.some((m) => pmRangesOverlap(m.range, item.range)));
        if (group) group.push(item);
        else groups.push([item]);
      }

      /*
        Oldest first — a group on one span is a conversation, and a conversation
        reads forward.

        The incoming list is recency-ordered, which is right for a list of
        *everything on the note* and wrong here: stepping through the dock
        carousel then walked backwards through an exchange, and the span was
        painted in the accent of the last reply rather than of the annotation
        that started it. Sorted rather than reversed, because the two entries
        can arrive in either order once replies stop being a strict append.
      */
      for (const group of groups) {
        group.sort((a, b) => String(a.entry.createdAt).localeCompare(String(b.entry.createdAt)));
      }

      const containerBox = containerEl.getBoundingClientRect();
      const next: SharedHighlightOverlayRect[] = [];

      for (const group of groups) {
        // Widest range in the group defines the painted span; the entry that
        // started the conversation is the click/accent representative.
        const span = group.reduce(
          (acc, m) => ({ from: Math.min(acc.from, m.range.from), to: Math.max(acc.to, m.range.to) }),
          { from: Infinity, to: -Infinity },
        );
        const head = group[0].entry;
        try {
          const start = editor.view!.coordsAtPos(span.from);
          const end = editor.view!.coordsAtPos(span.to);
          const authors = new Set(group.map((m) => m.entry.userId ?? m.entry.id));
          next.push({
            id: head.id,
            entryIds: group.map((m) => m.entry.id),
            top: Math.min(start.top, end.top) - containerBox.top,
            left: Math.min(start.left, end.left) - containerBox.left,
            width: Math.max(end.right - start.left, 8),
            height: Math.max(start.bottom - start.top, end.bottom - end.top, 14),
            accent: head.highlightAccentRaw ?? 'warmAmber',
            authorDisplayName: head.authorDisplayName,
            entryKind: head.entryKind,
            quote: head.anchorQuote ?? head.anchorTextSnapshot ?? head.sourceSnippet ?? undefined,
            authorCount: authors.size,
          });
        } catch {
          /* coords unavailable while doc is settling */
        }
      }

      return next;
    };

    const applyRects = (next: SharedHighlightOverlayRect[]) => {
      if (!cancelled) setRects(next);
    };

    const run = (attempt: number) => {
      if (cancelled) return;
      const overlayEntries = filterOverlayStudyThreads(studyThreads);
      const next = computeRects();
      if (next.length > 0 || overlayEntries.length === 0) {
        applyRects(next);
        return;
      }
      if (attempt < OVERLAY_COORD_MAX_ATTEMPTS) {
        rafId = window.requestAnimationFrame(() => run(attempt + 1));
      } else {
        applyRects(next);
      }
    };

    run(0);

    const onLayout = () => {
      if (cancelled) return;
      applyRects(computeRects());
    };

    window.addEventListener('resize', onLayout);
    window.addEventListener('scroll', onLayout, true);

    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onLayout) : null;
    resizeObserver?.observe(containerEl);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onLayout);
      window.removeEventListener('scroll', onLayout, true);
      resizeObserver?.disconnect();
    };
  }, [editor, containerEl, studyThreads, layoutRevision]);

  if (!rects.length) return null;

  return (
    <div className="proto-shared-highlight-overlay" role="group" aria-label="Shared note annotations">
      {rects.map((rect) => {
        const accessibleLabel = sharedHighlightOverlayButtonLabel(rect);
        return (
          <button
            key={rect.id}
            type="button"
            className="proto-shared-highlight-overlay__mark"
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
              ['--shared-highlight-accent' as string]: studyDockAccentCssVar(
                isStudyHighlightAccentKey(rect.accent) ? rect.accent : 'warmAmber',
              ),
            }}
            aria-label={accessibleLabel}
            title={accessibleLabel}
            onClick={() => onSelectEntry?.(rect.id, rect.entryIds)}
          >
            {rect.authorCount > 1 ? (
              <span className="proto-shared-highlight-overlay__badge" aria-hidden>
                {rect.authorCount}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
