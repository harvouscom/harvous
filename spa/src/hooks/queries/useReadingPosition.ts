import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import type { ReadingPosition } from '@/utils/reading-position';

export const readingPositionQueryKey = ['reading', 'position'] as const;

/**
 * Where reading left off.
 *
 * `position: null` is the honest answer for someone who has not opened a chapter yet, so an
 * empty result is a state to render rather than an error to handle.
 */
export function useReadingPosition(options: { enabled?: boolean } = {}) {
  const { userId } = useAuth();
  const authReady = useAuthReady();

  return useQuery({
    queryKey: readingPositionQueryKey,
    enabled: (options.enabled !== false) && authReady && !!userId,
    // Moved only by this device's own reader, which invalidates the key when it writes.
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await api.get<{ position: ReadingPosition | null }>('/api/reading/position');
      return res.position;
    },
  });
}
