import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { SpaceInviteRow } from '../queries/useSpace';

interface CreateInviteBody {
  expiresAt: string | null;
}

interface CreateInviteResponse {
  success: boolean;
  inviteId: string;
  inviteUrl: string;
  token: string;
  expiresAt: string | null;
  maxUses: number | null;
}

/** Creates a new invite link for a shared space (owner-only; the paid gate lives here). */
export function useCreateSpaceInvite(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateInviteBody) =>
      api.post<CreateInviteResponse>(`/api/spaces/${spaceId}/invites`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['space', spaceId, 'invites'] });
    },
  });
}

/** Revokes an active invite link (rotation = revoke + create). */
export function useRevokeSpaceInvite(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (inviteId: string) => api.delete<{ success: boolean }>(`/api/spaces/${spaceId}/invites/${inviteId}`),
    onMutate: async (inviteId) => {
      const key = ['space', spaceId, 'invites'];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<{ invites: SpaceInviteRow[] }>(key);
      if (previous) {
        queryClient.setQueryData(key, { invites: previous.invites.filter((i) => i.id !== inviteId) });
      }
      return { previous };
    },
    onError: (_err, _inviteId, context) => {
      if (context?.previous) queryClient.setQueryData(['space', spaceId, 'invites'], context.previous);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['space', spaceId, 'invites'] });
    },
  });
}
