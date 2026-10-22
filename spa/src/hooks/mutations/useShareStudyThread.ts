import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { mySharingQueryKey } from '../queries/useMySharing';
import {
  studyThreadShareQueryKey,
  studyThreadShareQueryKeyPrefix,
  type StudyThreadShareStatus,
} from '../queries/useStudyThreadShare';
import { normalizeNoteIdFromParam } from '../../pages/prototype/proto-route-slugs';
import { trackShareCreated } from '@/utils/analytics';

export type ShareStudyThreadAction = 'enable' | 'disable' | 'refresh';

export interface ShareStudyThreadInput {
  /** Any note in the Thread. */
  noteId: string;
  spaceId?: string | null;
  action: ShareStudyThreadAction;
}

/**
 * Turns a personal Thread's public link on, off, or over.
 *
 * Wraps `POST /api/notes/:id/thread/share`. `enable` is idempotent — pressing Share on a Thread
 * that already has a link hands back that link — which is what lets the Share button create and
 * copy in one press without minting a new link every time it is pressed.
 */
export function useShareStudyThread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ShareStudyThreadInput) =>
      api.post<StudyThreadShareStatus & { success: boolean }>(
        `/api/notes/${encodeURIComponent(normalizeNoteIdFromParam(input.noteId))}/thread/share`,
        { action: input.action, ...(input.spaceId ? { spaceId: input.spaceId } : {}) },
      ),
    onSuccess: (data, variables) => {
      if (variables.action !== 'disable' && data.isPublic && data.shareToken) {
        trackShareCreated({ noteId: variables.noteId, shareType: 'thread' });
      }
      const status: StudyThreadShareStatus = {
        isPublic: data.isPublic,
        shareToken: data.shareToken,
        shareUrl: data.shareUrl,
        shareTokenCreatedAt: data.shareTokenCreatedAt,
      };
      /* The key the caller is looking at paints at once; every other member's key is stale. */
      queryClient.setQueryData(studyThreadShareQueryKey(variables.noteId, variables.spaceId), status);
      void queryClient.invalidateQueries({
        queryKey: studyThreadShareQueryKeyPrefix,
        predicate: (query) => query.queryKey[2] !== variables.noteId,
      });
      void queryClient.invalidateQueries({ queryKey: mySharingQueryKey });
    },
  });
}
