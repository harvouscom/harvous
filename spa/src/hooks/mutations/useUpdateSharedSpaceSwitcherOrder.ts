import { useAuth } from '@clerk/clerk-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { UserProfile } from '../queries/useProfile';
import { updateCachedProfile } from '../queries/useProfile';

interface UpdateSharedSpaceSwitcherOrderResponse {
  success?: boolean;
  sharedSpaceSwitcherOrder: string[];
}

export function useUpdateSharedSpaceSwitcherOrder() {
  const queryClient = useQueryClient();
  const { userId } = useAuth();

  return useMutation({
    mutationFn: (spaceIds: string[]) =>
      api.post<UpdateSharedSpaceSwitcherOrderResponse>(
        '/api/user/update-shared-space-switcher-order',
        { spaceIds },
      ),
    onMutate: async (spaceIds) => {
      if (!userId) return;
      const key = ['profile', userId];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<UserProfile>(key);
      if (previous) {
        const next = { ...previous, sharedSpaceSwitcherOrder: spaceIds };
        queryClient.setQueryData(key, next);
        updateCachedProfile({ sharedSpaceSwitcherOrder: spaceIds });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (!userId || !ctx?.previous) return;
      queryClient.setQueryData(['profile', userId], ctx.previous);
      updateCachedProfile({ sharedSpaceSwitcherOrder: ctx.previous.sharedSpaceSwitcherOrder ?? null });
    },
    onSuccess: (data) => {
      if (!userId) return;
      const order = data.sharedSpaceSwitcherOrder ?? [];
      queryClient.setQueryData<UserProfile>(['profile', userId], (prev) =>
        prev ? { ...prev, sharedSpaceSwitcherOrder: order } : prev,
      );
      updateCachedProfile({ sharedSpaceSwitcherOrder: order });
    },
  });
}
