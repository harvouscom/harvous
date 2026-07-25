import { useAuth } from '@clerk/clerk-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import {
  appendOwnedSpaceToNavCache,
  navigationQueryKeyPrefix,
} from '../queries/useNavigation';

export interface CreateMinistryChannelBody {
  title: string;
  orgId: string;
  color?: string;
  description?: string | null;
  coverVariant?: number;
}

interface CreateMinistryChannelResponse {
  success?: string;
  space: {
    id: string;
    title: string;
    color: string | null;
    backgroundGradient: string | null;
    orgId?: string | null;
    type?: string;
  };
}

/** Creates a ministry channel (type=public + orgId). Staff-gated server-side. */
export function useCreateMinistryChannel() {
  const queryClient = useQueryClient();
  const { userId } = useAuth();

  return useMutation({
    mutationFn: (body: CreateMinistryChannelBody) =>
      api.post<CreateMinistryChannelResponse>('/api/spaces/create-ministry-channel', body),
    onSuccess: (data, vars) => {
      if (userId && data.space) {
        appendOwnedSpaceToNavCache(queryClient, userId, {
          id: data.space.id,
          title: data.space.title,
          color: data.space.color,
          backgroundGradient: data.space.backgroundGradient,
          type: 'public',
          orgId: data.space.orgId ?? vars.orgId,
        });
      }
      queryClient.invalidateQueries({ queryKey: navigationQueryKeyPrefix });
    },
  });
}
