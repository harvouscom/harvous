import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useAuthReady } from '../useAuthReady';
import { api, APIError } from '../../lib/api';
import { hasClerkSessionCookieHint } from './useProfile';

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
  const query = useQuery({
    queryKey: ['tags-list'],
    queryFn: () => api.get<TagsListResponse>('/api/tags/list'),
    enabled: authReady,
    staleTime: 30_000,
    retry: (failureCount, error) => {
      if (error instanceof APIError && error.status === 401) {
        return hasClerkSessionCookieHint() && failureCount < 2;
      }
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(500 * 2 ** attemptIndex, 2000),
  });

  const prevAuthReadyRef = useRef(authReady);
  useEffect(() => {
    const wasReady = prevAuthReadyRef.current;
    prevAuthReadyRef.current = authReady;
    if (!wasReady && authReady) {
      void query.refetch();
    }
  }, [authReady, query.refetch]);

  return query;
}
