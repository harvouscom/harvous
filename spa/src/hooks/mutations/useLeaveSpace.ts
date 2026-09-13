import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';
import { mySharedSpacesQueryKey } from '../queries/useMySharedSpaces';
import { mySharedSpaceNotesQueryKey } from '../queries/useMySharedSpaceNotes';
import { normalizeAssociationSpaceId } from './useSpaceNoteAssociation';

/**
 * Leave a shared space you are a member of.
 *
 * Not `useRemoveSpaceMember`, which is bound to one space when the hook is created — right for the
 * People sheet, which only ever shows one room, and unusable in a list of several. This takes the
 * space with each call. The request is the same one the People sheet's "Leave" sends: removing
 * yourself. The server refuses an owner, so callers only offer it to members.
 */
export function useLeaveSpace() {
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  return useMutation({
    mutationFn: ({ spaceId }: { spaceId: string }) => {
      if (!userId) throw new Error('Sign in to leave a space');
      const sid = normalizeAssociationSpaceId(spaceId);
      return api.delete<{ success: boolean; message?: string }>(
        `/api/spaces/${encodeURIComponent(sid)}/members/${encodeURIComponent(userId)}`,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: navigationQueryKeyPrefix });
      void queryClient.invalidateQueries({ queryKey: mySharedSpacesQueryKey });
      void queryClient.invalidateQueries({ queryKey: mySharedSpaceNotesQueryKey });
    },
  });
}
