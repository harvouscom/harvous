import { useQuery } from '@tanstack/react-query';
import { useAuthReady } from '../useAuthReady';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';
import { api } from '../../lib/api';
import type { HomeReferenceWordConnection } from '@/utils/prototype-home-trends';

export interface SpaceReferenceWordConnectionsResponse {
  success: boolean;
  connections: HomeReferenceWordConnection[];
}

export function usePrototypeSpaceReferenceWordConnections(spaceId: string | undefined) {
  const authReady = useAuthReady();
  const id = normalizePrototypeApiSpaceId(spaceId);
  return useQuery({
    queryKey: ['prototype', 'space', id, 'reference-word-connections'],
    enabled: authReady && Boolean(id),
    queryFn: async () => {
      const res = await api.get<SpaceReferenceWordConnectionsResponse>(
        `/api/spaces/${encodeURIComponent(id!)}/reference-word-connections`,
      );
      return res.connections ?? [];
    },
  });
}
