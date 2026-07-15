import { useQuery } from '@tanstack/react-query';
import { useAuthReady } from '../useAuthReady';
import { api, APIError } from '../../lib/api';

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
  const authReady = useAuthReady();
  return useQuery({
    queryKey: ['tags-list'],
    queryFn: () => api.get<TagsListResponse>('/api/tags/list'),
    enabled: authReady,
    staleTime: 30_000,
    retry: (failureCount, error) => {
      if (error instanceof APIError && error.status === 401) return false;
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(500 * 2 ** attemptIndex, 2000),
  });
}
