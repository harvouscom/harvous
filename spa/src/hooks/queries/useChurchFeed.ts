import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';

export type ChurchFeedItem = {
  noteId: string;
  /**
   * Reached the channel since the viewer last opened it, from someone else. Same
   * watermark as the switcher's count; clears when the channel is visited.
   * Optional so a payload cached before this shipped still parses.
   */
  isNew?: boolean;
  title: string | null;
  excerpt: string;
  noteType: string;
  publishedAt: string | null;
  updatedAt: string | null;
  channel: { id: string; title: string; color: string | null };
  author: { displayName: string; userColor: string; profileImageUrl: string | null };
};

export type ChurchFeedResponse = {
  connected: boolean;
  church?: { id: string; name: string };
  items: ChurchFeedItem[];
};

export function churchFeedQueryKey(userId: string | null | undefined) {
  return ['church-feed', userId ?? 'none'] as const;
}

/**
 * "From your church" — newest notes across followed ministry channels.
 * Preview cards only; opening one goes through the normal note read path.
 */
export function useChurchFeed(options?: { enabled?: boolean; limit?: number }) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const limit = options?.limit;

  return useQuery({
    queryKey: [...churchFeedQueryKey(userId), limit ?? null] as const,
    enabled: authReady && !!userId && options?.enabled !== false,
    queryFn: () =>
      api.get<ChurchFeedResponse>(
        limit ? `/api/church/feed?limit=${encodeURIComponent(String(limit))}` : '/api/church/feed',
      ),
    staleTime: 60_000,
  });
}
