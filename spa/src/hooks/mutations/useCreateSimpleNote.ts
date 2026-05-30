import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, APIError } from '../../lib/api';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';

function normalizedSpaceIdForApi(spaceId: string): string {
  return spaceId.startsWith('space_') ? spaceId : `space_${spaceId}`;
}

/** User-visible failure for prototype compose (and any caller of useCreateSimpleNote). */
export function alertCreateNoteFailure(err: unknown): void {
  const msg =
    err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Failed to create note';
  alert(msg);
}

interface CreateSimpleNoteBody {
  spaceId: string;
  title?: string;
  content?: string;
  noteType?: 'default' | 'scripture' | 'resource';
}

interface CreateNoteResponse {
  success?: string;
  note?: { id: string; title?: string; content?: string; spaceId?: string | null };
  error?: string;
}

/**
 * Create a note in a space without surfacing threads in the UI. Server resolves thread to unorganized when omitted.
 */
export function useCreateSimpleNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ spaceId, title = '', content = '<p></p>', noteType = 'default' }: CreateSimpleNoteBody) => {
      const sid = normalizedSpaceIdForApi(spaceId);
      return api.post<CreateNoteResponse>('/api/notes/create', {
        spaceId: sid,
        title,
        content,
        noteType,
        threadId: '',
      });
    },
    onSuccess: (_data, variables) => {
      const id = normalizedSpaceIdForApi(variables.spaceId);
      queryClient.invalidateQueries({ queryKey: ['space', id, 'notes'] });
      queryClient.invalidateQueries({ queryKey: ['space', id, 'bootstrap'] });
      queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
    },
  });
}
