import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';

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
    mutationFn: ({ spaceId, title = '', content = '<p></p>', noteType = 'default' }: CreateSimpleNoteBody) =>
      api.post<CreateNoteResponse>('/api/notes/create', {
        spaceId,
        title,
        content,
        noteType,
        threadId: '',
      }),
    onSuccess: (_data, variables) => {
      const id = variables.spaceId.startsWith('space_') ? variables.spaceId : `space_${variables.spaceId}`;
      queryClient.invalidateQueries({ queryKey: ['space', id, 'notes'] });
      queryClient.invalidateQueries({ queryKey: ['space', id, 'bootstrap'] });
      queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
    },
  });
}
