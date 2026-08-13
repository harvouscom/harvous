import { useAuth } from '@clerk/clerk-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { MeetingKind } from '@/utils/space-meeting-rhythm';
import {
  appendOwnedSpaceToNavCache,
  navigationQueryKeyPrefix,
} from '../queries/useNavigation';

export interface CreateChurchSharedSpaceBody {
  title: string;
  orgId: string;
  color?: string;
  description?: string | null;
  coverVariant?: number;
  /** 0–6, Sunday first. When the room gathers — display and defaults only. */
  meetingDay?: number | null;
  /** 'HH:MM' 24h wall clock. Needs a day. */
  meetingTime?: string | null;
  /** 'in_person' | 'online' | 'hybrid'. */
  meetingKind?: MeetingKind | null;
  /** https only, and only on an online or hybrid room. */
  meetingUrl?: string | null;
}

interface CreateChurchSharedSpaceResponse {
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

/** Creates a church-scoped Shared Space (type=shared + orgId). Staff-gated server-side. */
export function useCreateChurchSharedSpace() {
  const queryClient = useQueryClient();
  const { userId } = useAuth();

  return useMutation({
    mutationFn: (body: CreateChurchSharedSpaceBody) =>
      api.post<CreateChurchSharedSpaceResponse>('/api/spaces/create-church-shared', body),
    onSuccess: (data, vars) => {
      if (userId && data.space) {
        appendOwnedSpaceToNavCache(queryClient, userId, {
          id: data.space.id,
          title: data.space.title,
          color: data.space.color,
          backgroundGradient: data.space.backgroundGradient,
          type: 'shared',
          orgId: data.space.orgId ?? vars.orgId,
        });
      }
      queryClient.invalidateQueries({ queryKey: navigationQueryKeyPrefix });
    },
  });
}
