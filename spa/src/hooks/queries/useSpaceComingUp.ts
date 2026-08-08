import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import type { ChurchSermon } from '../../lib/church-services';

/**
 * The room's next gathering, for the people who gather in it.
 *
 * Distinct from `useChurchSpacePlan`, which is the staff read of the same rows
 * and is gated on `sermon_tools` — a member firing that one only ever gets a
 * 403. This asks a membership-gated endpoint for the narrow thing a member
 * needs: what are we on, and let me write about it.
 */
export type SpaceComingUpResponse = {
  space?: {
    id: string;
    title: string;
    /** 0 = Sunday. Null until staff set the room's rhythm. */
    meetingDay: number | null;
    meetingTime: string | null;
  };
  /**
   * The window, not one row — which of these is "next" depends on the viewer's
   * own day, and `currentSermonFor` already owns that judgement.
   *
   * Absent for a room with no plan, a channel, or a non-member: all three are
   * "render nothing", and the card does not need to tell them apart.
   */
  services?: ChurchSermon[];
};

export function spaceComingUpQueryKey(
  userId: string | null | undefined,
  spaceId: string | null | undefined,
) {
  return ['space-coming-up', userId ?? 'none', spaceId ?? 'none'] as const;
}

export function useSpaceComingUp(spaceId: string | null | undefined, options?: { enabled?: boolean }) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const trimmed = spaceId?.trim() || null;

  return useQuery({
    queryKey: spaceComingUpQueryKey(userId, trimmed),
    enabled: authReady && !!userId && !!trimmed && options?.enabled !== false,
    queryFn: () =>
      api.get<SpaceComingUpResponse>(
        `/api/church/spaces/${encodeURIComponent(trimmed!)}/coming-up`,
      ),
    staleTime: 30_000,
    retry: false,
  });
}
