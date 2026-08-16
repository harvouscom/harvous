import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';

/**
 * The plan row this note is already written for, if the viewer wrote it.
 *
 * Asked here rather than carried on the note, because `plannedForServiceId` has a deliberately
 * short list of permitted readers and the note route is not on it. One small request for a
 * fact the note payload is not allowed to hold.
 *
 * Only for staff who can see a plan at all — a viewer with nowhere to put a note has no
 * question to ask, and gating here keeps a general note view from making a church request.
 */
export function useNotePlannedService(noteId: string | null | undefined, enabled: boolean) {
  const { userId } = useAuth();
  const authReady = useAuthReady();

  return useQuery({
    queryKey: ['church', 'planned-for-note', noteId] as const,
    enabled: enabled && authReady && !!userId && !!noteId,
    // Moved only by this viewer's own linking, which invalidates the plan caches alongside it.
    staleTime: 60 * 1000,
    queryFn: async () => {
      const params = new URLSearchParams({ noteId: noteId! });
      const res = await api.get<{ serviceId: string | null }>(
        `/api/church/services/planned-for-note?${params.toString()}`,
      );
      return res.serviceId;
    },
  });
}
