import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export interface NoteDetail {
  id: string;
  title: string | null;
  content: string | null;
  type: string;
  createdAt: string;
  updatedAt: string;
  threads: { id: string; title: string; color: string | null; backgroundGradient: string }[];
  spaces: { id: string; title: string }[];
  tags: { id: string; name: string }[];
  isPublic: boolean;
  shareToken: string | null;
}

export function useNote(noteId: string) {
  return useQuery({
    queryKey: ['note', noteId],
    queryFn: () => api.get<NoteDetail>(`/api/notes/${noteId}/details`),
    enabled: !!noteId,
    staleTime: 10_000,
  });
}
