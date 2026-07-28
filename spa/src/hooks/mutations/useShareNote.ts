import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { mySharingQueryKey } from '../queries/useMySharing';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';
import { trackShareCreated } from '@/utils/analytics';

export type ShareNoteAction = 'enable' | 'disable' | 'refresh';

export interface ShareNoteInput {
  noteId: string;
  action: ShareNoteAction;
  acknowledgeSharedContext?: boolean;
}

export interface ShareNoteResponse {
  success: boolean;
  isPublic: boolean;
  shareToken: string | null;
  shareUrl: string | null;
  shareTokenCreatedAt: string | null;
}

export function buildShareNoteRequest(input: ShareNoteInput) {
  return {
    url: `/api/notes/${input.noteId}/share`,
    body: {
      action: input.action,
      ...(input.acknowledgeSharedContext ? { acknowledgeSharedContext: true } : {}),
    },
  };
}

/**
 * Mutation hook for toggling / refreshing a note's share link.
 *
 * Wraps `POST /api/notes/:noteId/share` with `{ action: 'enable' | 'disable' | 'refresh' }`.
 * The server (`server/routes/notes.ts:1620`) flips `Notes.isPublic` and rotates
 * `Notes.shareToken`, returning the new share URL.
 *
 * Usage:
 *   const shareNote = useShareNote();
 *   const result = await shareNote.mutateAsync({ noteId, action: 'enable' });
 *
 * On success, patches the `['note', noteId]` cache so the share button + popover
 * reflect the new `isPublic` / `shareToken` immediately, then invalidates the
 * note detail and any sidebar lists that might surface a public badge.
 * Pattern mirrors `useUpdateNote.ts`.
 */
export function useShareNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ShareNoteInput) => {
      const request = buildShareNoteRequest(input);
      return api.post<ShareNoteResponse>(request.url, request.body);
    },
    onSuccess: (data, variables) => {
      if (
        (variables.action === 'enable' || variables.action === 'refresh') &&
        data.isPublic &&
        data.shareToken
      ) {
        trackShareCreated({ noteId: variables.noteId, shareType: 'note' });
      }
      // Optimistically patch the cached note so the UI reflects the new state
      // before the invalidation refetch lands — otherwise the toggle flickers
      // off-then-on (or the URL appears blank for a beat).
      queryClient.setQueryData<Record<string, unknown> | undefined>(
        ['note', variables.noteId],
        (prev) => {
          if (!prev || typeof prev !== 'object') return prev;
          return {
            ...prev,
            isPublic: data.isPublic,
            shareToken: data.shareToken,
          };
        },
      );
      queryClient.invalidateQueries({ queryKey: ['note', variables.noteId] });
      // Lists may render a "Public" badge — keep them in sync. Scope to the
      // note's space when the detail cache knows it; a bare ['space'] key
      // matches every space's queries and stampedes refetches.
      const cachedSpaceId = (
        queryClient.getQueryData<Record<string, unknown> | undefined>(['note', variables.noteId]) as
          | { spaceId?: string | null }
          | undefined
      )?.spaceId;
      if (typeof cachedSpaceId === 'string' && cachedSpaceId.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['space', cachedSpaceId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['space'] });
      }
      queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
      queryClient.invalidateQueries({ queryKey: ['thread'] });
      queryClient.invalidateQueries({ queryKey: mySharingQueryKey });
    },
  });
}
