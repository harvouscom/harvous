import { useQuery } from '@tanstack/react-query';
import { useAuthReady } from '../useAuthReady';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';
import { api } from '../../lib/api';
import type { HomeCrossRefConnection } from '@/utils/prototype-home-trends';

export interface SpaceScriptureConnectionsResponse {
  success: boolean;
  connections: HomeCrossRefConnection[];
}

export function usePrototypeSpaceScriptureConnections(spaceId: string | undefined) {
  const authReady = useAuthReady();
  const id = normalizePrototypeApiSpaceId(spaceId);
  return useQuery({
    queryKey: ['prototype', 'space', id, 'scripture-connections'],
    enabled: authReady && Boolean(id),
    queryFn: async () => {
      const res = await api.get<SpaceScriptureConnectionsResponse>(
        `/api/spaces/${encodeURIComponent(id!)}/scripture-connections`,
      );
      return res.connections ?? [];
    },
  });
}
