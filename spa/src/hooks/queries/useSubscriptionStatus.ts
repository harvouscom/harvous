import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface SubscriptionStatusResponse {
  hasUnlimited: boolean;
  hasSharedSpaces: boolean;
  currentCount: number;
  limit: number | null;
}

/** Client-side mirror of the server's Shared Spaces add-on gate (server 403 stays authoritative). */
export function useSubscriptionStatus() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleSubscriptionChange = () => {
      void queryClient.invalidateQueries({ queryKey: ['subscription', 'status'] });
    };
    window.addEventListener('subscriptionUpgraded', handleSubscriptionChange);
    return () => window.removeEventListener('subscriptionUpgraded', handleSubscriptionChange);
  }, [queryClient]);

  return useQuery({
    queryKey: ['subscription', 'status'],
    queryFn: () => api.get<SubscriptionStatusResponse>('/api/subscription/status'),
    staleTime: 30_000,
  });
}
