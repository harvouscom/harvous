import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface JoinSpaceResult {
  success: boolean;
  spaceId: string;
  redirectUrl: string;
}

/**
 * Mutation hook for joining a space via a share token.
 *
 * Usage:
 *   const joinSpace = useJoinSpace();
 *   const result = await joinSpace.mutateAsync(token);
 */
export function useJoinSpace() {
  return useMutation({
    mutationFn: (token: string) =>
      api.post<JoinSpaceResult>(`/api/spaces/join/${token}`, {}),
  });
}
