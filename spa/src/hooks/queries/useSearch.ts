import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export interface SearchResult {
  id: string;
  type: 'note' | 'thread';
  title: string | null;
  content?: string | null;
  subtitle?: string | null;
  color?: string | null;
  threadId?: string;
  spaceId?: string | null;
  noteType?: string | null;
  version?: string | null;
  scriptureTranslation?: string | null;
  lastUpdated?: string | null;
  threadTitle?: string;
  backgroundGradient?: string;
  score?: number;
}

export function useSearch(query: string) {
  return useQuery({
    queryKey: ['search', query],
    queryFn: () => api.get<{ results: SearchResult[] }>('/api/search', { q: query }),
    enabled: query.trim().length > 0,
    staleTime: 30_000,
  });
}
