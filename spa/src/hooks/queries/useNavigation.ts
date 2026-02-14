import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export interface NavThread {
  id: string;
  title: string;
  color: string | null;
  noteCount: number;
  spaceId: string | null;
  backgroundGradient: string;
  accentColor: string;
  isPinned: boolean;
}

export interface NavSpace {
  id: string;
  title: string;
  color: string | null;
  backgroundGradient: string;
  ownerId: string;
  memberCount: number;
}

export interface NavigationData {
  threads: NavThread[];
  spaces: NavSpace[];
  memberOfSpaces: NavSpace[];
  inboxCount: number;
}

export const navigationQueryKey = ['navigation'] as const;

export function useNavigation() {
  return useQuery({
    queryKey: navigationQueryKey,
    queryFn: () => api.get<NavigationData>('/api/navigation/data'),
    staleTime: 30_000,
  });
}

export function useRefreshNavigation() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: navigationQueryKey });
}
