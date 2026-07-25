import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PlanKey } from '@/lib/billing-plans';
import { api } from '../../lib/api';
import type { BillingSubscriptionSummary } from '../queries/useSubscriptionStatus';

type CancelResponse = { billing: BillingSubscriptionSummary; plan: PlanKey };

export type CancelVariables = {
  cancelAtPeriodEnd: boolean;
  /** Which subscription to act on. Defaults to Plus. */
  plan?: PlanKey;
};

/**
 * Schedule cancel at period end (`true`) or resume (`false`).
 * Invalidates subscription status; does not clear local entitlements early.
 *
 * Plan-scoped: Plus and Connector are separate subscriptions, so the cache
 * patch has to land on the matching field or canceling one would appear to
 * cancel the other.
 */
export function useBillingCancel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cancelAtPeriodEnd, plan = 'plus' }: CancelVariables) =>
      api.post<CancelResponse>('/api/billing/cancel', { cancelAtPeriodEnd, plan }),
    onSuccess: (data, variables) => {
      const plan = data.plan ?? variables.plan ?? 'plus';
      queryClient.setQueryData(['subscription', 'status'], (prev: unknown) => {
        if (!prev || typeof prev !== 'object') return prev;
        const field = plan === 'connector' ? 'connectorBilling' : 'billing';
        return { ...prev, [field]: data.billing, canManageBilling: true };
      });
      void queryClient.invalidateQueries({ queryKey: ['subscription', 'status'] });
      void queryClient.invalidateQueries({ queryKey: ['billing', 'manage'] });
      window.dispatchEvent(new CustomEvent('subscriptionUpgraded'));
    },
  });
}
