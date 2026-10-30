import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import { churchSermonsQueryKey } from './useChurchSermons';

export type ChurchServiceSlot = {
  dayOfWeek: number;
  /** 'HH:MM' 24h on the church's wall clock. */
  startTime: string;
  label: string | null;
  /** Set for a church on Harvous; null for times read from the directory. */
  serviceTimeId: string | null;
};

export type ChurchServiceChoiceResponse = {
  /** 'church' = the church's own times; 'directory' = its Here's My Church listing; 'none' = nothing to pick. */
  source: 'church' | 'directory' | 'none';
  slots: ChurchServiceSlot[];
  choice: ChurchServiceSlot | null;
  /** They chose a service the church no longer lists. */
  choiceStale: boolean;
  /** Channels and groups that meet during the chosen service. */
  meetsDuringSpaceIds: string[];
};

export function churchServiceChoiceQueryKey(userId: string | null | undefined) {
  return ['church-service-choice', userId ?? 'none'] as const;
}

/** The viewer's own service and the times on offer. Pass `enabled` once they have a church. */
export function useChurchServiceChoice(options?: { enabled?: boolean }) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  return useQuery({
    queryKey: churchServiceChoiceQueryKey(userId),
    enabled: authReady && !!userId && options?.enabled !== false,
    queryFn: () => api.get<ChurchServiceChoiceResponse>('/api/user/church/service'),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** Choose (or clear) the viewer's service. The server answers with the whole new state. */
export function useSetChurchServiceChoice() {
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const key = churchServiceChoiceQueryKey(userId);
  return useMutation({
    mutationFn: (input: { dayOfWeek: number; startTime: string } | null) =>
      api.post<ChurchServiceChoiceResponse>('/api/user/church/service', input ?? { clear: true }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ChurchServiceChoiceResponse>(key);
      if (previous) {
        const choice = input
          ? previous.slots.find((slot) => slot.dayOfWeek === input.dayOfWeek && slot.startTime === input.startTime) ?? null
          : null;
        queryClient.setQueryData<ChurchServiceChoiceResponse>(key, { ...previous, choice, choiceStale: false });
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      // This Sunday shows the chosen service's time.
      void queryClient.invalidateQueries({ queryKey: churchSermonsQueryKey(userId) });
    },
  });
}
