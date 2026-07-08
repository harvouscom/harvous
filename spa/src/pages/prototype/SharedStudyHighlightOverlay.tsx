import { useLayoutEffect, useState } from 'react';
import { studyDockAccentCssVar } from '@/utils/study-highlight-accents';
import type { StudyThreadEntryDetail } from '../../hooks/queries/useNote';
import { filterOverlayStudyThreads, resolveStudyThreadPmRange } from '../../lib/shared-highlight-overlay';

const OVERLAY_COORD_MAX_ATTEMPTS = 120;

type EditorLike = {
  view?: {
    coordsAtPos: (pos: number) => { top: number; left: number; bottom: number; right: number };
  };
  state: { doc: Parameters<typeof resolveStudyThreadPmRange>[0] };
};

export type SharedHighlightOverlayRect = {
  id: string;
  top: number;
  left: number;
  width: number;
  height: number;
  accent: string;
  authorDisplayName?: string;
};

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
  onSelectEntry?: (entryId: string) => void;
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
      const containerBox = containerEl.getBoundingClientRect();
      const next: SharedHighlightOverlayRect[] = [];

      for (const entry of overlayEntries) {
        const range = resolveStudyThreadPmRange(editor.state.doc, entry);
        if (!range) continue;
        try {
          const start = editor.view!.coordsAtPos(range.from);
          const end = editor.view!.coordsAtPos(range.to);
          next.push({
            id: entry.id,
            top: Math.min(start.top, end.top) - containerBox.top,
            left: Math.min(start.left, end.left) - containerBox.left,
            width: Math.max(end.right - start.left, 8),
            height: Math.max(start.bottom - start.top, end.bottom - end.top, 14),
            accent: entry.highlightAccentRaw ?? 'warmAmber',
            authorDisplayName: entry.authorDisplayName,
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

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onLayout) : null;
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
    <div className="proto-shared-highlight-overlay" aria-hidden>
      {rects.map((rect) => (
        <button
          key={rect.id}
          type="button"
          className="proto-shared-highlight-overlay__mark"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            ['--shared-highlight-accent' as string]: studyDockAccentCssVar(rect.accent),
          }}
          title={rect.authorDisplayName ? `${rect.authorDisplayName}'s highlight` : 'Shared highlight'}
          onClick={() => onSelectEntry?.(rect.id)}
        />
      ))}
    </div>
  );
}
