import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { NoteDetail } from '../queries/useNote';
import { fetchAndMergeNoteTagsInCache } from '../../lib/note-tags-cache';
import { invalidatePrototypeSpaceDerivedQueries } from '../../lib/prototype-space-query-keys';
import { getEffectiveDefaultTranslation } from '@/utils/profile-cache';

interface ProcessScriptureInput {
  noteId: string;
  contentOverride: string;
  threadId?: string;
  translation?: string;
}

interface ProcessScriptureResponse {
  results?: unknown[];
  updatedContent?: string;
}

/**
 * Mutation hook for processing scripture references in a note.
 * Triggers the server to detect scripture references and create pill markup.
 *
 * On success, patches cached note content immediately when the API returns updated HTML, then invalidates
 * so a background refetch stays in sync (thread lists, version, etc.).
 */
export function useProcessScriptureRefs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ noteId, contentOverride, threadId, translation }: ProcessScriptureInput) =>
      api.post<ProcessScriptureResponse>(`/api/notes/${noteId}/process-scripture-references`, {
        contentOverride,
        threadId,
        translation: translation ?? getEffectiveDefaultTranslation(),
      }),
    onSuccess: (data, variables) => {
      const updated = data?.updatedContent;
      if (typeof updated === 'string' && updated.length > 0) {
        // Patch the materialized pill content, but preserve the existing updatedAt: this runs on the
        // view/backfill path (opening a note), and the server intentionally does NOT bump updatedAt
        // there. Overwriting it here would optimistically reorder the note just for being viewed.
        queryClient.setQueryData<NoteDetail | undefined>(['note', variables.noteId], (old) =>
          old ? { ...old, content: updated } : old
        );
      }
      void fetchAndMergeNoteTagsInCache(queryClient, variables.noteId);
      const cached = queryClient.getQueryData<NoteDetail | undefined>(['note', variables.noteId]);
      invalidatePrototypeSpaceDerivedQueries(queryClient, cached?.spaceId);
    },
  });
}
