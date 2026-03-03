import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface ProcessScriptureInput {
  noteId: string;
  contentOverride: string;
  threadId?: string;
}

/**
 * Mutation hook for processing scripture references in a note.
 * Triggers the server to detect scripture references and create pill markup.
 *
 * On success, invalidates the note cache so the updated content (with pills) is refetched.
 */
export function useProcessScriptureRefs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ noteId, contentOverride, threadId }: ProcessScriptureInput) =>
      api.post(`/api/notes/${noteId}/process-scripture-references`, { contentOverride, threadId }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['note', variables.noteId] });
    },
  });
}
