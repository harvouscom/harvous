import { useLayoutEffect, useState } from 'react';
import { studyDockAccentCssVar } from '@/utils/study-highlight-accents';
import type { StudyThreadEntryDetail } from '../../hooks/queries/useNote';
import { filterOverlayStudyThreads, resolveStudyThreadPmRange } from '../../lib/shared-highlight-overlay';

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
  onSelectEntry,
}: {
  editor: EditorLike | null;
  containerEl: HTMLElement | null;
  studyThreads: StudyThreadEntryDetail[] | undefined;
  onSelectEntry?: (entryId: string) => void;
}) {
  const [rects, setRects] = useState<SharedHighlightOverlayRect[]>([]);

  useLayoutEffect(() => {
    if (!editor?.view || !containerEl) {
      setRects([]);
      return;
    }

    const overlayEntries = filterOverlayStudyThreads(studyThreads);
    const containerBox = containerEl.getBoundingClientRect();
    const next: SharedHighlightOverlayRect[] = [];

    for (const entry of overlayEntries) {
      const range = resolveStudyThreadPmRange(editor.state.doc, entry);
      if (!range) continue;
      try {
        const start = editor.view.coordsAtPos(range.from);
        const end = editor.view.coordsAtPos(range.to);
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

    setRects(next);
  }, [editor, containerEl, studyThreads]);

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
            backgroundColor: `color-mix(in srgb, ${studyDockAccentCssVar(rect.accent)} 38%, transparent)`,
            boxShadow: `inset 0 -2px 0 ${studyDockAccentCssVar(rect.accent)}`,
          }}
          title={rect.authorDisplayName ? `${rect.authorDisplayName}'s highlight` : 'Shared highlight'}
          onClick={() => onSelectEntry?.(rect.id)}
        />
      ))}
    </div>
  );
}
