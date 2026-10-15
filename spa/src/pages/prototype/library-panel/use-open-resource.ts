/**
 * Where a resource goes when you act on it — shared by the Library panel and the
 * expanded Resources tool, so "dock it or follow it" is decided in one place.
 */
import { useCallback } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import {
  isPrototypeNotePath,
  matchPrototypeNoteId,
  prototypeNoteRouteTo,
} from '@/lib/prototype-path';
import { prototypeNoteListNavigationSearch } from '@/utils/prototype-sidebar-highlight-active';
import { resolvePrototypeToolbarNoteId } from '@/utils/prototype-compose-url';
import {
  isPrototypeDraftNoteSlug,
  noteParamSlug,
  normalizeNoteIdFromParam,
} from '../proto-route-slugs';
import { useProtoShell } from '../../../layouts/proto-shell-context';
import { useActiveSpace } from '../../../hooks/useActiveSpace';
import { openLibraryFileItem } from '../../../hooks/queries/useLibrary';
import { recordRecentOpen } from './proto-recent-opens';

/** The fields leaving the app needs — every shelf's item type has them. */
export type FollowableResource = {
  id: string;
  /** 'link' | 'file' — typed loosely because every shelf's item type is. */
  kind: string;
  sourceUrl: string | null;
};

/**
 * Leave Harvous for the resource itself: a fresh signed URL for a file (they expire in
 * minutes, so one is never stored), the link otherwise.
 */
export function followResource(item: FollowableResource): void {
  if (item.kind === 'file') {
    void openLibraryFileItem(item.id);
    return;
  }
  if (item.sourceUrl) window.open(item.sourceUrl, '_blank', 'noopener,noreferrer');
}

/** The note open in the main pane, if any — the only place a resource chip can dock. */
export function useActiveNoteFullId(): string | undefined {
  const { composePersistedNoteId } = useProtoShell();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (!isPrototypeNotePath(pathname)) return undefined;
  const slug = matchPrototypeNoteId(pathname);
  const isDraft = slug != null && isPrototypeDraftNoteSlug(slug);
  return (
    resolvePrototypeToolbarNoteId(composePersistedNoteId, slug, isDraft, normalizeNoteIdFromParam) ??
    undefined
  );
}

/**
 * Docks a personal resource onto the open note, so it sits beside what you are writing.
 * Returns false when there is no note to dock onto, leaving the caller to decide.
 *
 * `onDocked` is the surface's own way out — the panel and the expanded tool each close
 * themselves, and only they know how.
 */
export function useDockResource({
  spaceId,
  onDocked,
}: {
  /** The scope the open was made from, for the recents list. */
  spaceId: string | null | undefined;
  onDocked: () => void;
}) {
  const navigate = useNavigate();
  const { activeSpaceId, isSharedSpace } = useActiveSpace();
  const activeNoteFullId = useActiveNoteFullId();

  const dock = useCallback(
    (item: { id: string }): boolean => {
      if (!activeNoteFullId) return false;
      recordRecentOpen(spaceId ?? null, 'resource', item.id);
      navigate({
        to: prototypeNoteRouteTo(),
        params: { noteId: noteParamSlug(activeNoteFullId) },
        search: {
          /* The shell's context, not the panel's: this re-navigates the note already open,
             and that note's `?space=` is a fact about it. Taking the panel's Home scope here
             would drop it — 404ing a note reachable only through the room, or moving the
             shell home just for docking a chip. */
          ...prototypeNoteListNavigationSearch({
            isScopedSharedSpace: isSharedSpace,
            spaceId: activeSpaceId ?? '',
          }),
          libItem: item.id,
          dockReq: String(Date.now()),
        },
      });
      onDocked();
      return true;
    },
    [activeNoteFullId, spaceId, navigate, isSharedSpace, activeSpaceId, onDocked],
  );

  return { canDock: Boolean(activeNoteFullId), dock };
}

/**
 * Where a resource opens.
 *
 * The study dock is per-note, so a resource chip only has somewhere to live when a
 * note is open. Jumping to an arbitrary note just to hold the chip would be worse
 * than following the link, so: dock it when we are on a note, open it otherwise.
 */
export function useOpenResource({
  spaceId,
  onDocked,
}: {
  spaceId: string | null | undefined;
  onDocked: () => void;
}) {
  const { dock } = useDockResource({ spaceId, onDocked });
  return useCallback(
    (item: FollowableResource) => {
      if (dock(item)) return;
      recordRecentOpen(spaceId ?? null, 'resource', item.id);
      followResource(item);
    },
    [dock, spaceId],
  );
}
