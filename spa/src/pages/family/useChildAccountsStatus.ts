import { useAuth } from '@clerk/clerk-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthReady } from '../../hooks/useAuthReady';
import { api } from '../../lib/api';
import type { FamilyStatus } from './types';

export function useChildAccountsStatus() {
  const ready = useAuthReady();
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['family', userId, 'child-accounts'],
    enabled: ready,
    meta: { persist: false },
    queryFn: () => api.get<FamilyStatus & { privacyUrl?: string; childAppUrl?: string }>('/api/child-accounts/status')
  });
}
