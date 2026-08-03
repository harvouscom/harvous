import { useCallback } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  isPrototypeHomePath,
  matchPrototypeNoteId,
  prototypeHomeRouteTo,
} from '@/lib/prototype-path';
import { shouldCloseNoteOnSpaceSwitch } from '../lib/note-audience';
import { toPrototypeSpaceSearchParam } from '../utils/prototype-space-api-id';
import { useProtoShell } from '../layouts/proto-shell-context';
import { HOME_LOCATION, HOME_PARENT, type SpaceParent } from '../layouts/proto-location';
import { usePrototypeHomeSpaceId } from './usePrototypeHomeSpaceId';
import type { NoteDetail } from './queries/useNote';
import { isPrototypeDraftNoteSlug, normalizeNoteIdFromParam } from '../pages/prototype/proto-route-slugs';

/**
 * Find this note's cached detail regardless of which space context it was
 * fetched under.
 *
 * A note opened with `?space=` caches under the context-suffixed key
 * `['note', id, 'space_X']` (see `getNoteQueryOptions` in `queries/useNote.ts`),
 * not the bare `['note', id]`. An exact-key read misses it entirely, which
 * used to make every downstream guard in `shouldCloseNoteOnSpaceSwitch` fail
 * open on the resulting `undefined` — a foreign, read-only note would never
 * close on switching to My Home. Prefix-matching finds it under any key;
 * when more than one cached entry exists, prefer whichever has `spaces`
 * populated (the richer, detail-endpoint read) over a bare list-seed.
 */
export function findCachedNoteAcrossContexts(
  queryClient: QueryClient,
  noteId: string,
): NoteDetail | undefined {
  return queryClient
    .getQueriesData<NoteDetail>({ queryKey: ['note', noteId] })
    .map(([, data]) => data)
    .reduce<NoteDetail | undefined>((best, data) => {
      if (!data) return best;
      if (!best) return data;
      return best.spaces === undefined && data.spaces !== undefined ? data : best;
    }, undefined);
}

/**
 * Switch the active space, treating the switcher as navigation.
 *
 * The space switcher sits above the open note in the hierarchy: it answers "where
 * am I", not "what am I looking at". So if the destination space can't contain the
 * open note, the note closes and the detail pane falls back to the empty state.
 * The payoff is that membership stops being a thing you have to infer — if a note
 * is still on screen, it belongs to the space you're in.
 *
 * This is deliberately an **event**, fired on a user-initiated switch, rather than
 * a render-time invariant. As a continuous guard it would vanish a private note
 * the instant you opened it from a My-Home-scoped list inside a shared space.
 *
 * Unsaved work is safe: CardFullEditable flushes pending edits on unmount (the
 * same path as navigating to another note), so closing here can't drop a body.
 */
export function useSwitchToSpace() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { homeSpaceId } = usePrototypeHomeSpaceId();
  const { setLocation, composeDraftActive } = useProtoShell();

  return useCallback(
    /**
     * @param parent Destination parent. Omit and it's derived as My Home —
     *   correct for personal spaces and for `null`. Callers that already hold
     *   the space row should pass `parentForSpace(space)` so a church channel
     *   lands in church context because of where it lives, not because of a
     *   flag the caller remembered.
     */
    (spaceId: string | null, parent: SpaceParent = HOME_PARENT) => {
      const slug = matchPrototypeNoteId(pathname);
      // A compose draft lives on `/` too; it retargets rather than closing.
      const isDraft = composeDraftActive || (slug != null && isPrototypeDraftNoteSlug(slug));
      const hasOpenNote = slug != null || (composeDraftActive && isPrototypeHomePath(pathname));

      if (hasOpenNote && !isDraft && slug) {
        const noteId = normalizeNoteIdFromParam(slug);
        const note = findCachedNoteAcrossContexts(queryClient, noteId);
        const shouldClose = shouldCloseNoteOnSpaceSwitch({
          destinationSpaceId: spaceId,
          homeSpaceId,
          noteSpaceIds: note?.spaces?.map((space) => space.id),
          isOwnNote: note?.isOwnNote !== false,
          isDraft: false,
        });
        if (shouldClose) {
          // Push, don't replace: back returns to the note with its original
          // `?space=`, which remounts and re-syncs the switcher to that space.
          // `as any` matches the existing call sites — the router's generated
          // route union doesn't include the dynamic prototype base path.
          void navigate({ to: prototypeHomeRouteTo() as any });
        } else {
          // The note survives the switch (it's in the destination space too, or we
          // moved to Home). Re-stamp `?space=` so the URL doesn't keep asserting the
          // space we just left — otherwise the toolbar and the switcher disagree.
          void navigate({
            to: '.',
            search: (prev: Record<string, unknown>) => ({
              ...prev,
              space: toPrototypeSpaceSearchParam(spaceId),
            }),
            replace: true,
          } as any);
        }
      }

      setLocation(spaceId ? { parent, spaceId } : HOME_LOCATION);
    },
    [pathname, composeDraftActive, queryClient, homeSpaceId, navigate, setLocation],
  );
}
