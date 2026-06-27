import { useQuery } from '@tanstack/react-query';
import { useAuthReady } from '../useAuthReady';
import { api } from '../../lib/api';

export interface CrossRefGapRef {
  book: string;
  chapter: number;
  verse: number;
  displayRef: string;
}

export interface CrossRefGap {
  from: CrossRefGapRef;
  to: CrossRefGapRef;
  votes: number;
}

interface Response {
  success: boolean;
  gaps: CrossRefGap[];
}

export function useCrossRefGaps() {
  const authReady = useAuthReady();
  return useQuery({
    queryKey: ['note-crossref-gaps'],
    enabled: authReady,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const res = await api.get<Response>('/api/notes/crossref-gaps');
      return res.gaps ?? [];
    },
  });
}
