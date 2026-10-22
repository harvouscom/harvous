import { useQuery } from '@tanstack/react-query';
import { useAuthReady } from '../useAuthReady';
import { api, APIError } from '../../lib/api';
import { normalizeNoteIdFromParam } from '../../pages/prototype/proto-route-slugs';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';

/** A personal Thread's public link, as `GET /api/notes/:id/thread/share` reports it. */
export interface StudyThreadShareStatus {
  isPublic: boolean;
  shareToken: string | null;
  shareUrl: string | null;
  shareTokenCreatedAt: string | null;
}

/** Every Thread-share key starts here, so a change can refresh all of them at once. */
export const studyThreadShareQueryKeyPrefix = ['prototype', 'thread-share'] as const;

export function studyThreadShareQueryKey(noteId: string | undefined, spaceId?: string | null) {
  return [...studyThreadShareQueryKeyPrefix, noteId ?? '', normalizePrototypeApiSpaceId(spaceId) ?? ''] as const;
}

/**
 * The link for the personal Thread `noteId` belongs to. Any member note answers for the whole
 * Thread — the server walks the cluster — so callers pass whichever note they have in hand.
 */
export function useStudyThreadShare(noteId: string | undefined, spaceId?: string | null, enabled = true) {
  const authReady = useAuthReady();
  const scopeId = normalizePrototypeApiSpaceId(spaceId);
  return useQuery({
    queryKey: studyThreadShareQueryKey(noteId, scopeId),
    enabled: authReady && enabled && Boolean(noteId),
    staleTime: 30_000,
    queryFn: async () => {
      const fullId = normalizeNoteIdFromParam(noteId!);
      const qs = scopeId ? `?spaceId=${encodeURIComponent(scopeId)}` : '';
      return api.get<StudyThreadShareStatus>(`/api/notes/${encodeURIComponent(fullId)}/thread/share${qs}`);
    },
    retry: (failureCount, error) => {
      if (error instanceof APIError && error.status === 401) return false;
      return failureCount < 2;
    },
  });
}
