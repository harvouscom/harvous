import { useQuery } from '@tanstack/react-query';
import { useAuthReady } from '../useAuthReady';
import { api } from '../../lib/api';

export interface ConnectSuggestion {
  noteAId: string;
  noteATitle: string;
  noteBId: string;
  noteBTitle: string;
  reason: string;
  score: number;
}

interface Response {
  success: boolean;
  suggestions: ConnectSuggestion[];
}

export function useConnectSuggestions() {
  const authReady = useAuthReady();
  return useQuery({
    queryKey: ['note-connect-suggestions'],
    enabled: authReady,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const res = await api.get<Response>('/api/notes/connect-suggestions');
      return res.suggestions ?? [];
    },
  });
}
