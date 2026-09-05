import React, { useCallback, useState } from 'react';
import { toast } from '@/utils/toast';
import { billingErrorMessage } from '@/lib/billing-errors';

interface ManageSubscriptionButtonProps {
  /** Must be a single element (typically a `<button>`) — receives the click handler + disabled state. */
  children: React.ReactElement<{ onClick?: (e: React.MouseEvent) => void; disabled?: boolean }>;
  /** Unused with Polar — kept so callers that still pass a Clerk-era publishable key don't need to change. */
  publishableKey?: string | null;
  /** Unused — Settings manage layer owns cancel/resume; kept for call-site compatibility. */
  onSubscriptionCancel?: () => void;
}

async function getClerkBearerToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const clerk = (
      window as unknown as {
        Clerk?: { session?: { getToken?: () => Promise<string | null> } };
      }
    ).Clerk;
    return (await clerk?.session?.getToken?.()) || null;
  } catch {
    return null;
  }
}

/**
 * Opens the Polar hosted portal in the same tab (payment method / invoices).
 * Plan cancel/resume lives in Settings › Plan — do not use this for full manage.
 */
export function ManageSubscriptionButton({ children }: ManageSubscriptionButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const headers = new Headers();
      const token = await getClerkBearerToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);

      const res = await fetch('/api/billing/portal', {
        credentials: 'include',
        headers,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 404) {
          throw new Error(
            body.error === 'No billing customer found'
              ? 'No billing account yet — manage is available after a Polar checkout'
              : body.error || 'Unable to open billing portal',
          );
        }
        throw new Error(billingErrorMessage(body, 'Unable to open billing portal.'));
      }
      const { url } = (await res.json()) as { url?: string };
      if (!url) throw new Error('Unable to open billing portal');

      window.location.assign(url);
    } catch (error) {
      console.error('[ManageSubscriptionButton] Failed to open billing portal:', error);
      toast.error(
        error instanceof Error ? error.message : 'Unable to open billing management. Please try again.',
      );
      setIsLoading(false);
    }
  }, [isLoading]);

  return React.cloneElement(children, {
    onClick: (e: React.MouseEvent) => {
      children.props.onClick?.(e);
      void handleClick();
    },
    disabled: isLoading || children.props.disabled,
  });
}

export default ManageSubscriptionButton;
export { ManageSubscriptionButton as SafeSubscriptionDetailsButton };
