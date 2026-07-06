import { useAuth } from '@clerk/clerk-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import {
  appendOwnedSpaceToNavCache,
  navigationQueryKeyPrefix,
} from '../queries/useNavigation';

interface CreateSharedSpaceBody {
  title: string;
  color?: string;
}

interface CreateSharedSpaceResponse {
  success?: string;
  space: { id: string; title: string; color: string | null; backgroundGradient: string | null };
}

/** Creates a new shared space (paid add-on gate enforced server-side). */
export function useCreateSharedSpace() {
  const queryClient = useQueryClient();
  const { userId } = useAuth();

  return useMutation({
    mutationFn: (body: CreateSharedSpaceBody) =>
      api.post<CreateSharedSpaceResponse>('/api/spaces/create-shared', body),
    onSuccess: (data) => {
      if (userId && data.space) {
        appendOwnedSpaceToNavCache(queryClient, userId, data.space);
      }
      queryClient.invalidateQueries({ queryKey: navigationQueryKeyPrefix });
    },
  });
}
