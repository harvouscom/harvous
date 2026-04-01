import { useQuery } from '@tanstack/react-query';
import { APIError } from '../../lib/api';

export type FeaturedContentType = 'space' | 'recall' | 'challenge' | 'church';

export interface FeaturedItem {
  id: string;
  contentType: FeaturedContentType;
  title: string;
  description: string | null;
  refId: string | null;
  shareToken: string | null;
  color: string | null;
}

export const featuredItemsQueryKey = ['featured-items'] as const;

export function useFeaturedItems() {
  return useQuery({
    queryKey: featuredItemsQueryKey,
    queryFn: async () => {
      const res = await fetch('/api/featured/items', { credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new APIError(res.status, (body as { error?: string })?.error ?? `HTTP ${res.status}`);
      }
      return (await res.json()) as FeaturedItem[];
    },
    staleTime: 60_000,
    retry: 1,
  });
}

