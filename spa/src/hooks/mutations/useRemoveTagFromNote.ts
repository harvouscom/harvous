import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { NoteDetail } from '../queries/useNote';
import { runOfflineFirst } from './withOfflineQueue';
import { removeTagFromNoteOffline } from '@/utils/offline-mutations';

interface RemoveTagInput {
  noteId: string;
  /** Remove a single tag link by id. */
  tagId?: string;
  /** Remove all tag links whose name matches (case-insensitive). */
  tagName?: string;
}

interface RemoveTagResponse {
  success: boolean;
  message?: string;
  removed?: number;
}

export function useRemoveTagFromNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ noteId, tagId, tagName }: RemoveTagInput) => {
      // Resolve a concrete tagId for the offline queue when only a name was given.
      const cached = queryClient.getQueryData<NoteDetail>(['note', noteId]);
      const resolvedTagId =
        tagId ??
        cached?.tags?.find((t) => t.name.toLowerCase() === (tagName ?? '').trim().toLowerCase())?.id ??
        null;

      return runOfflineFirst({
        online: () => {
          if (tagName?.trim()) {
            return api.delete<RemoveTagResponse>(
              `/api/note-tags/remove-by-name?noteId=${encodeURIComponent(noteId)}&name=${encodeURIComponent(tagName.trim())}`,
            );
          }
          if (!tagId) throw new Error('tagId or tagName is required');
          return api.delete<RemoveTagResponse>(
            `/api/note-tags/remove?noteId=${encodeURIComponent(noteId)}&tagId=${encodeURIComponent(tagId)}`,
          );
        },
        // Only queue when we have a concrete tagId; a name with no matching cached tag can't be
        // resolved offline, so it stays online-only (the optimistic removal is rolled back on error).
        offline: resolvedTagId
          ? (userId) => removeTagFromNoteOffline(userId, { noteId, tagId: resolvedTagId })
          : undefined,
      });
    },
    onMutate: async ({ noteId, tagId, tagName }) => {
      await queryClient.cancelQueries({ queryKey: ['note', noteId] });
      const previous = queryClient.getQueryData<NoteDetail>(['note', noteId]);
      const name = (tagName ?? '').trim().toLowerCase();
      if (previous?.tags?.length) {
        queryClient.setQueryData<NoteDetail>(['note', noteId], {
          ...previous,
          tags: previous.tags.filter((t) =>
            tagId ? t.id !== tagId : t.name.toLowerCase() !== name,
          ),
        });
      }
      return { previous, noteId };
    },
    onError: (_err, variables, context) => {
      if (context?.previous) queryClient.setQueryData(['note', variables.noteId], context.previous);
    },
    onSuccess: (outcome, variables) => {
      if (!outcome.queued) {
        queryClient.invalidateQueries({ queryKey: ['note', variables.noteId] });
        queryClient.invalidateQueries({ queryKey: ['tags-list'] });
      }
    },
  });
}
