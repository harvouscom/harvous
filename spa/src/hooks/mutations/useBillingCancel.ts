import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { BillingSubscriptionSummary } from '../queries/useSubscriptionStatus';

type CancelResponse = { billing: BillingSubscriptionSummary };

export type CancelVariables = {
  cancelAtPeriodEnd: boolean;
};

/**
 * Schedule cancel at period end (`true`) or resume (`false`).
 * Invalidates subscription status; does not clear local entitlements early.
 */
export function useBillingCancel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cancelAtPeriodEnd }: CancelVariables) =>
      api.post<CancelResponse>('/api/billing/cancel', { cancelAtPeriodEnd }),
    onSuccess: (data) => {
      queryClient.setQueryData(['subscription', 'status'], (prev: unknown) => {
        if (!prev || typeof prev !== 'object') return prev;
        return { ...prev, billing: data.billing, canManageBilling: true };
      });
      void queryClient.invalidateQueries({ queryKey: ['subscription', 'status'] });
      void queryClient.invalidateQueries({ queryKey: ['billing', 'manage'] });
      window.dispatchEvent(new CustomEvent('subscriptionUpgraded'));
    },
  });
}
