import { useQuery } from '@tanstack/react-query';
import { MIN_SEARCH_QUERY_LENGTH } from '@/utils/search-query';

export type SearchResultType = 'all' | 'notes' | 'threads';

export interface SearchScope {
  spaceId?: string;
  threadId?: string;
  /** Omit classic `noteType: scripture` rows (2.0 prototype search). */
  excludeLegacyScriptureNotes?: boolean;
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
  primaryCollection?: string | null;
  secondaryCollections?: string[];
}

function buildSearchUrl(query: string, scope?: SearchScope, resultType: SearchResultType = 'all'): string {
  const params = new URLSearchParams({ q: query.trim() });
  if (scope?.threadId) params.set('threadId', scope.threadId);
  if (scope?.spaceId) params.set('spaceId', scope.spaceId);
  if (scope?.excludeLegacyScriptureNotes) params.set('excludeLegacyScripture', '1');
  if (resultType !== 'all') params.set('type', resultType);
  const base = import.meta.env.VITE_API_BASE_URL || '';
  return `${base}/api/search?${params}`;
}

export function searchQueryKey(query: string, scope?: SearchScope, resultType: SearchResultType = 'all') {
  const q = query.trim();
  return [
    'search',
    q,
    scope?.threadId ?? null,
    scope?.spaceId ?? null,
    scope?.excludeLegacyScriptureNotes ?? false,
    resultType,
  ] as const;
}

export async function fetchSearchResults(
  query: string,
  scope?: SearchScope,
  resultType: SearchResultType = 'all',
): Promise<{ results: SearchResult[] }> {
  const q = query.trim();
  const res = await fetch(buildSearchUrl(q, scope, resultType), {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ results: SearchResult[] }>;
}

export function useSearch(query: string, scope?: SearchScope, resultType: SearchResultType = 'all') {
  const trimmed = query.trim();
  return useQuery({
    queryKey: searchQueryKey(trimmed, scope, resultType),
    queryFn: () => fetchSearchResults(trimmed, scope, resultType),
    enabled: trimmed.length >= MIN_SEARCH_QUERY_LENGTH,
    staleTime: 30_000,
  });
}
