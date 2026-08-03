import { useQuery } from '@tanstack/react-query';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';

export interface ReferencesIndexNoteBrief {
  id: string;
  title: string | null;
  updatedAt: string | null;
}

export interface ReferencesIndexUrl {
  href: string;
  title: string | null;
  noteCount: number;
  notes: ReferencesIndexNoteBrief[];
}

export interface ReferencesIndexDomain {
  domain: string;
  referenceCount: number;
  noteCount: number;
  urls: ReferencesIndexUrl[];
}

export interface SpaceReferencesIndexResponse {
  success: boolean;
  domains: ReferencesIndexDomain[];
}

export function usePrototypeSpaceReferencesIndex(spaceId: string | undefined) {
  const authReady = useAuthReady();
  const id = normalizePrototypeApiSpaceId(spaceId);
  return useQuery({
    queryKey: ['prototype', 'space', id, 'references-index'],
    enabled: authReady && Boolean(id),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await api.get<SpaceReferencesIndexResponse>(
        `/api/spaces/${encodeURIComponent(id!)}/references-index`,
      );
      return res.domains ?? [];
    },
  });
}
