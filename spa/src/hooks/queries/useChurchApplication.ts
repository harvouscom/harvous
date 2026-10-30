import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';

export type ChurchApplication = {
  id: string;
  status: 'pending' | 'approved' | 'declined' | 'withdrawn';
  hmcChurchId: string | null;
  name: string;
  city: string | null;
  state: string | null;
  churchId: string | null;
  decisionNote: string | null;
  createdAt: string;
};

export type MyChurchApplicationResponse = {
  application: ChurchApplication | null;
  church: { id: string; name: string; orgId: string } | null;
};

export type ChurchApplicationInput = {
  hmcChurchId?: string | null;
  name?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  applicantRole: string;
  contactEmail?: string | null;
  timezone?: string | null;
  notes?: string | null;
};

export function myChurchApplicationQueryKey(userId: string | null | undefined) {
  return ['church-application', userId ?? 'none'] as const;
}

/** The viewer's own latest request to bring a church to Harvous. */
export function useMyChurchApplication(options?: { enabled?: boolean }) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  return useQuery({
    queryKey: myChurchApplicationQueryKey(userId),
    enabled: authReady && !!userId && options?.enabled !== false,
    queryFn: () => api.get<MyChurchApplicationResponse>('/api/church-applications/mine'),
    staleTime: 60_000,
    retry: false,
  });
}

export function useChurchApplicationActions() {
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: myChurchApplicationQueryKey(userId) });
  const submit = useMutation({
    mutationFn: (input: ChurchApplicationInput) => api.post<{ application: ChurchApplication }>('/api/church-applications', input),
    onSettled: invalidate,
  });
  const withdraw = useMutation({
    mutationFn: (id: string) => api.post(`/api/church-applications/${encodeURIComponent(id)}/withdraw`, {}),
    onSettled: invalidate,
  });
  return { submit, withdraw };
}
