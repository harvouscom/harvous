import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export interface SharedNoteItem {
  id: string;
  title: string;
  shareToken: string;
  shareUrl: string;
}

export interface SharedThreadItem {
  id: string;
  title: string;
  color?: string | null;
  shareToken: string;
  shareUrl: string;
}

export interface MySharingResponse {
  threads: SharedThreadItem[];
  notes: SharedNoteItem[];
}

export const mySharingQueryKey = ['profile', 'my-sharing'] as const;

export function useMySharing() {
  return useQuery({
    queryKey: mySharingQueryKey,
    queryFn: () => api.get<MySharingResponse>('/api/profile/my-sharing'),
    staleTime: 30_000,
  });
}
