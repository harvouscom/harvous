import { useAuth } from '@clerk/clerk-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import {
  appendOwnedSpaceToNavCache,
  navigationQueryKeyPrefix,
} from '../queries/useNavigation';
import { trackSpaceCreated } from '@/utils/analytics';
import type { MeetingKind } from '@/utils/space-meeting-rhythm';

export interface CreateSharedSpaceBody {
  title: string;
  color?: string;
  description?: string | null;
  coverVariant?: number;
  /** 0–6, Sunday first. When the room gathers — display and defaults only. */
  meetingDay?: number | null;
  /** 'HH:MM' 24h wall clock, no zone. Needs a day. */
  meetingTime?: string | null;
  /** 'in_person' | 'online' | 'hybrid'. */
  meetingKind?: MeetingKind | null;
  /** https only, and only on an online or hybrid room. */
  meetingUrl?: string | null;
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
        trackSpaceCreated({ spaceId: data.space.id });
      }
      queryClient.invalidateQueries({ queryKey: navigationQueryKeyPrefix });
    },
  });
}
