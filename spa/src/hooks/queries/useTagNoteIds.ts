import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface TagNoteIdsResponse {
  success: boolean;
  noteIds: string[];
}

export function useTagNoteIds(tagId: string | undefined, spaceId: string | undefined) {
  return useQuery({
    queryKey: ['tag-note-ids', tagId, spaceId],
    queryFn: () => {
      const params = new URLSearchParams({ tagId: tagId! });
      if (spaceId) params.set('spaceId', spaceId);
      return api.get<TagNoteIdsResponse>(`/api/tags/notes-by-tag?${params}`);
    },
    enabled: Boolean(tagId),
    staleTime: 30_000,
  });
}
