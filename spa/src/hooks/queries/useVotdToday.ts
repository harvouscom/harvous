import { useQuery } from '@tanstack/react-query';
import { fetchVotdToday } from '../../lib/votd-today';

export const votdTodayQueryKey = ['votd', 'today'] as const;

export function useVotdToday(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: votdTodayQueryKey,
    enabled: options?.enabled !== false,
    queryFn: fetchVotdToday,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
}
