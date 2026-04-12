import { useQuery } from '@tanstack/react-query';
import { APIError } from '../../lib/api';

export type FeaturedContentType = 'space' | 'thread' | 'recall' | 'challenge' | 'church' | 'votd';

export interface VotdMetadata {
  reference: string;
  translation: string;
  verseText: string;
  book: string;
  chapter: number | null;
  verse: number | null;
  verseEnd: number | null;
}

export interface FeaturedItem {
  id: string;
  contentType: FeaturedContentType;
  title: string;
  description: string | null;
  refId: string | null;
  shareToken: string | null;
  color: string | null;
  metadata: VotdMetadata | null;
}

export const featuredItemsQueryKey = ['featured-items'] as const;

function browserIanaTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function useFeaturedItems(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: featuredItemsQueryKey,
    enabled: options?.enabled !== false,
    queryFn: async () => {
      const res = await fetch('/api/featured/items', {
        credentials: 'include',
        headers: { 'X-Votd-Timezone': browserIanaTimeZone() },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new APIError(res.status, (body as { error?: string })?.error ?? `HTTP ${res.status}`);
      }
      return (await res.json()) as FeaturedItem[];
    },
    placeholderData: (previousData) => previousData,
    staleTime: 60_000,
    retry: 1,
  });
}

