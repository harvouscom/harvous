import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';

interface UpdateNoteInput {
  noteId: string;
  title: string;
  content: string;
  primaryCollection?: string | null;
  secondaryCollections?: string[];
  collectionPinned?: boolean;
  collectionUserOverride?: boolean;
}

interface UpdateNoteResponse {
  success: boolean;
  note?: {
    id: string;
    title: string;
    content: string;
    updatedAt: string;
  };
  scriptureResults?: unknown;
}

/**
 * Mutation hook for updating a note (title + content).
 *
 * Usage:
 *   const updateNote = useUpdateNote();
 *   await updateNote.mutateAsync({ noteId, title, content });
 *
 * On success, invalidates the note detail cache so the UI reflects the latest save.
 */
export function useUpdateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateNoteInput) => {
      const { noteId, title, content, primaryCollection, secondaryCollections, collectionPinned, collectionUserOverride } = input;
      const body: Record<string, unknown> = { noteId, title, content };
      if (primaryCollection !== undefined) body.primaryCollection = primaryCollection;
      if (secondaryCollections !== undefined) body.secondaryCollections = secondaryCollections;
      if (collectionPinned !== undefined) body.collectionPinned = collectionPinned;
      if (collectionUserOverride !== undefined) body.collectionUserOverride = collectionUserOverride;
      return api.put<UpdateNoteResponse>('/api/notes/update', body as any);
    },
    onSuccess: (_data, variables) => {
      // Optimistically patch the note detail cache so navigating back / refreshing
      // immediately shows the typed content without waiting for the refetch to
      // round-trip. Without this, a fast refresh after typing can briefly show
      // pre-save content, which reads as "save didn't persist."
      //
      // We also read the note's space/threads from the cache here so list
      // invalidation can be scoped to just the affected space/threads instead of
      // every space and thread (the note is open, so its detail cache — populated
      // by GET …/details — has spaceId + threads). Falls back to broad invalidation
      // when those aren't known yet.
      let affectedSpaceId: string | undefined;
      let affectedThreadIds: string[] = [];
      queryClient.setQueryData<Record<string, unknown> | undefined>(
        ['note', variables.noteId],
        (prev) => {
          if (!prev || typeof prev !== 'object') return prev;
          const p = prev as Record<string, unknown>;
          if (typeof p.spaceId === 'string' && p.spaceId.length > 0) affectedSpaceId = p.spaceId;
          if (Array.isArray(p.threads)) {
            affectedThreadIds = (p.threads as Array<{ id?: unknown }>)
              .map((t) => (typeof t?.id === 'string' ? t.id : null))
              .filter((id): id is string => !!id);
          }
          return {
            ...p,
            title: variables.title,
            content: variables.content,
            // Authoritative full content now in cache — clear any list-preview flag.
            __contentIsPreview: false,
            ...(variables.primaryCollection !== undefined ? { primaryCollection: variables.primaryCollection } : {}),
            ...(variables.secondaryCollections !== undefined ? { secondaryCollections: variables.secondaryCollections } : {}),
            ...(variables.collectionPinned !== undefined ? { collectionPinned: variables.collectionPinned } : {}),
            ...(variables.collectionUserOverride !== undefined ? { collectionUserOverride: variables.collectionUserOverride } : {}),
          };
        },
      );
      // The note detail cache was just patched optimistically with the saved
      // title/content, so we intentionally do NOT invalidate ['note', noteId] here —
      // that would trigger a redundant GET …/details on every autosave.

      // List/sidebar caches — without these the sidebar shows the old title
      // ("New Note") indefinitely after a save. Scope to the affected space/threads
      // (prefix match also covers ['space', id, 'notes'] / ['thread', id, 'notes']),
      // falling back to broad invalidation only when the ids aren't cached yet.
      if (affectedSpaceId) {
        queryClient.invalidateQueries({ queryKey: ['space', affectedSpaceId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['space'] });
      }
      if (affectedThreadIds.length > 0) {
        for (const tid of affectedThreadIds) {
          queryClient.invalidateQueries({ queryKey: ['thread', tid] });
        }
      } else {
        queryClient.invalidateQueries({ queryKey: ['thread'] });
      }
      queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
      window.dispatchEvent(new CustomEvent('noteUpdated', { detail: { noteId: variables.noteId } }));
    },
  });
}
