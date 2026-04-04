import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export interface SearchScope {
  spaceId?: string;
  threadId?: string;
}

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
  threadColors?: Array<{ color: string; frequency: number }>;
}

function searchParams(query: string, scope?: SearchScope) {
  const q = query.trim();
  const params: Record<string, string> = { q };
  if (scope?.threadId) params.threadId = scope.threadId;
  if (scope?.spaceId) params.spaceId = scope.spaceId;
  return params;
}

export function useSearch(query: string, scope?: SearchScope) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['search', trimmed, scope?.threadId ?? null, scope?.spaceId ?? null],
    queryFn: () => api.get<{ results: SearchResult[] }>('/api/search', searchParams(trimmed, scope)),
    enabled: trimmed.length > 0,
    staleTime: 30_000,
  });
}
