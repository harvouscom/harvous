import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface JoinSpaceResult {
  success: boolean;
  spaceId: string;
  spaceName?: string;
  alreadyMember?: boolean;
  redirectUrl: string;
}

/**
 * Mutation hook for redeeming a shared-space invite link.
 *
 * Usage:
 *   const joinSpace = useJoinSpace();
 *   const result = await joinSpace.mutateAsync(token);
 */
export function useJoinSpace() {
  return useMutation({
    mutationFn: (token: string) =>
      api.post<JoinSpaceResult>(`/api/spaces/invites/${token}/redeem`, {}),
  });
}
