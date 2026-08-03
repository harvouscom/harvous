import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import type { BillingSubscriptionSummary } from './useSubscriptionStatus';

export type BillingPaymentMethodSummary = {
  brand: string;
  last4: string;
};

export type BillingOrderSummary = {
  id: string;
  createdAt: string;
  amountCents: number;
  currency: string;
  invoiceNumber: string | null;
  hasInvoice: boolean;
};

export type BillingManageResponse = {
  /** Harvous Plus subscription, if any. */
  billing: BillingSubscriptionSummary | null;
  /** Connector subscription, if any — separate product, billed separately. */
  connector: BillingSubscriptionSummary | null;
  /** Customer-level — covers both products. */
  paymentMethod: BillingPaymentMethodSummary | null;
  orders: BillingOrderSummary[];
};

/** Rich Settings › Plan payload — only when Polar manages the subscription. */
export function useBillingManage(enabled: boolean) {
  const authReady = useAuthReady();
  return useQuery({
    queryKey: ['billing', 'manage'],
    queryFn: () => api.get<BillingManageResponse>('/api/billing/manage'),
    enabled: authReady && enabled,
    staleTime: 30_000,
    retry: false,
  });
}
