import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { trackSpaceJoined } from '@/utils/analytics';

interface AcceptInvitationResult {
  success: boolean;
  space: { id: string };
  redirectUrl: string;
}

/**
 * Mutation hook for accepting a space invitation.
 *
 * Usage:
 *   const acceptInvitation = useAcceptInvitation();
 *   const result = await acceptInvitation.mutateAsync(token);
 */
export function useAcceptInvitation() {
  return useMutation({
    mutationFn: (token: string) =>
      api.post<AcceptInvitationResult>(`/api/invitations/${token}/accept`, {}),
    onSuccess: (data) => {
      if (data.success && data.space?.id) {
        trackSpaceJoined({ spaceId: data.space.id, method: 'invite' });
      }
    },
  });
}
