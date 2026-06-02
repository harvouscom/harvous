import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, APIError } from '../../lib/api';
import type { TagSummary } from '../queries/useTagsList';

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
 */
export function useAddTagToNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ noteId, tagName, existingTags }: AddTagInput) => {
      const trimmed = tagName.trim();
      if (!trimmed) throw new Error('Tag name is required');

      const existing = existingTags.find(
        (t) => t.name.toLowerCase() === trimmed.toLowerCase(),
      );

      let tagId: string;
      if (existing) {
        tagId = existing.id;
      } else {
        try {
          const created = await api.post<CreateTagResponse>('/api/tags/create', {
            name: trimmed,
          });
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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['note', variables.noteId] });
      queryClient.invalidateQueries({ queryKey: ['tags-list'] });
    },
  });
}
