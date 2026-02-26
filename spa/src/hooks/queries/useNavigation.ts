import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, APIError } from '../../lib/api';

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
    queryFn: async () => {
      const res = await fetch('/api/navigation/data', { credentials: 'include', cache: 'no-store' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new APIError(res.status, (body as { error?: string })?.error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<NavigationData>;
    },
    staleTime: 30_000,
  });
}

export function useRefreshNavigation() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: navigationQueryKey });
}
