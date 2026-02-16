import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export interface SearchResult {
  id: string;
  type: 'note' | 'thread';
  title: string | null;
  content: string | null;
  threadId?: string;
  threadTitle?: string;
  backgroundGradient?: string;
  score?: number;
}

export function useSearch(query: string) {
  return useQuery({
    queryKey: ['search', query],
    queryFn: () => api.get<{ results: SearchResult[] }>('/api/search', { q: query }),
    enabled: query.trim().length > 1,
    staleTime: 30_000,
  });
}
