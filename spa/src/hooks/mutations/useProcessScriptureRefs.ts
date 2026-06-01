import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { NoteDetail } from '../queries/useNote';
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
        queryClient.setQueryData<NoteDetail | undefined>(['note', variables.noteId], (old) =>
          old ? { ...old, content: updated, updatedAt: new Date().toISOString() } : old
        );
      }
    },
  });
}
