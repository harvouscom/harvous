import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useAuthReady } from '../useAuthReady';
import { api, APIError } from '../../lib/api';
import { hasClerkSessionCookieHint } from './useProfile';

interface TagNoteIdsResponse {
  success: boolean;
  noteIds: string[];
}

export function useTagNoteIds(tagId: string | undefined, spaceId: string | undefined) {
  const authReady = useAuthReady();
  const query = useQuery({
    queryKey: ['tag-note-ids', tagId, spaceId],
    queryFn: () => {
      const params = new URLSearchParams({ tagId: tagId! });
      if (spaceId) params.set('spaceId', spaceId);
      return api.get<TagNoteIdsResponse>(`/api/tags/notes-by-tag?${params}`);
    },
    enabled: authReady && Boolean(tagId),
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
    if (!wasReady && authReady && tagId) {
      void query.refetch();
    }
  }, [authReady, tagId, query.refetch]);

  return query;
}
