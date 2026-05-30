import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { mySharingQueryKey } from '../queries/useMySharing';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';

export type ShareNoteAction = 'enable' | 'disable' | 'refresh';

export interface ShareNoteInput {
  noteId: string;
  action: ShareNoteAction;
}

export interface ShareNoteResponse {
  success: boolean;
  isPublic: boolean;
  shareToken: string | null;
  shareUrl: string | null;
  shareTokenCreatedAt: string | null;
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
    mutationFn: ({ noteId, action }: ShareNoteInput) =>
      api.post<ShareNoteResponse>(`/api/notes/${noteId}/share`, { action } as any),
    onSuccess: (data, variables) => {
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
      // Lists may render a "Public" badge — keep them in sync.
      queryClient.invalidateQueries({ queryKey: ['space'] });
      queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
      queryClient.invalidateQueries({ queryKey: ['thread'] });
      queryClient.invalidateQueries({ queryKey: mySharingQueryKey });
    },
  });
}
