import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, APIError } from '../../lib/api';
import type { TagSummary } from '../queries/useTagsList';
import type { NoteDetail } from '../queries/useNote';
import { runOfflineFirst } from './withOfflineQueue';
import { addTagToNoteOffline } from '@/utils/offline-mutations';

interface AddTagInput {
  noteId: string;
  tagName: string;
  existingTags: TagSummary[];
}

interface CreateTagResponse {
  success: boolean;
  created?: boolean;
  tag: TagSummary;
}

interface AssignResponse {
  success: boolean;
  relationId?: string;
}

/**
 * Adds a tag to a note. If the tag doesn't exist in the user's library yet,
 * creates it first, then assigns. Mirrors native's "just type a string" UX.
 *
 * Offline-aware: optimistically shows the tag on the open note, and when the network is down
 * queues the create/assign to the durable sync queue (via `addTagToNoteOffline`) so it lands
 * on reconnect instead of being lost.
 */
export function useAddTagToNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ noteId, tagName, existingTags }: AddTagInput) => {
      const trimmed = tagName.trim();
      if (!trimmed) throw new Error('Tag name is required');

      const existing = existingTags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
      const existingTagId = existing?.id ?? null;

      return runOfflineFirst({
        online: async () => {
          let tagId: string;
          if (existing) {
            tagId = existing.id;
          } else {
            try {
              const created = await api.post<CreateTagResponse>('/api/tags/create', { name: trimmed });
              tagId = created.tag.id;
            } catch (err) {
              if (err instanceof APIError && err.status === 409) {
                const list = await api.get<{ tags: TagSummary[] }>('/api/tags/list');
                const fallback = list.tags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
                if (!fallback) throw err;
                tagId = fallback.id;
              } else {
                throw err;
              }
            }
          }

          try {
            await api.post<AssignResponse>('/api/note-tags/assign', { noteId, tagId });
          } catch (err) {
            if (err instanceof APIError && err.status === 409) {
              /* tag already assigned — treat as success */
            } else {
              throw err;
            }
          }

          return { tagId };
        },
        offline: (userId) =>
          addTagToNoteOffline(userId, { noteId, tagId: existingTagId, tagName: trimmed }).then(() => undefined),
      });
    },
    onMutate: async ({ noteId, tagName, existingTags }) => {
      const trimmed = tagName.trim();
      await queryClient.cancelQueries({ queryKey: ['note', noteId] });
      const previous = queryClient.getQueryData<NoteDetail>(['note', noteId]);
      // Optimistically append the tag so it shows immediately (online and offline) — unless
      // the note already carries a tag with that name.
      if (previous && !previous.tags?.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) {
        const existing = existingTags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
        queryClient.setQueryData<NoteDetail>(['note', noteId], {
          ...previous,
          tags: [...(previous.tags ?? []), { id: existing?.id ?? `local_tag_${Date.now()}`, name: trimmed }],
        });
      }
      return { previous, noteId };
    },
    onError: (_err, variables, context) => {
      if (context?.previous) queryClient.setQueryData(['note', variables.noteId], context.previous);
    },
    onSuccess: (outcome, variables) => {
      // When queued offline, keep the optimistic tag and skip refetches that would just fail.
      if (!outcome.queued) {
        queryClient.invalidateQueries({ queryKey: ['note', variables.noteId] });
        queryClient.invalidateQueries({ queryKey: ['tags-list'] });
      }
    },
  });
}
