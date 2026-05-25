import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export interface TagSummary {
  id: string;
  name: string;
  color: string | null;
  category: string | null;
  userId: string;
  isSystem: boolean;
  noteCount?: number;
}

interface TagsListResponse {
  success: boolean;
  tags: TagSummary[];
}

export function useTagsList() {
  return useQuery({
    queryKey: ['tags-list'],
    queryFn: () => api.get<TagsListResponse>('/api/tags/list'),
    staleTime: 30_000,
  });
}
