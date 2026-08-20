import { useQuery } from '@tanstack/react-query';
import { APIError } from '../../lib/api';

export interface FeaturedSpace {
  id: string;
  title: string;
  description: string | null;
  color: string | null;
  shareToken: string;
  joinUrl: string;
}

export const featuredSpaceQueryKey = ['featured-space'] as const;

export function useFeaturedSpace() {
  return useQuery({
    queryKey: featuredSpaceQueryKey,
    queryFn: async () => {
      // auth-gate-exempt: /api/featured/space reads the Harvous system user's public
      // featured space and checks no session, so a signed-out visitor gets the same answer.
      const res = await fetch('/api/featured/space', { credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new APIError(res.status, (body as { error?: string })?.error ?? `HTTP ${res.status}`);
      }
      return (await res.json()) as FeaturedSpace | null;
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

