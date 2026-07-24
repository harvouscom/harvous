import React, { useCallback, useState } from 'react';

interface ManageSubscriptionButtonProps {
  /** Must be a single element (typically a `<button>`) — receives the click handler + disabled state. */
  children: React.ReactElement<{ onClick?: (e: React.MouseEvent) => void; disabled?: boolean }>;
  /** Unused with Paddle — kept so callers that still pass a Clerk-era publishable key don't need to change. */
  publishableKey?: string | null;
  /** Called once focus returns to this tab after the user visits the Paddle customer portal. */
  onSubscriptionCancel?: () => void;
}

/**
 * Opens the Paddle customer portal (`GET /api/billing/portal`) in a new tab so the
 * user can manage payment methods or cancel. Paddle Billing has no in-app drawer —
 * when focus returns to this tab, re-check subscription status optimistically.
 */
export function ManageSubscriptionButton({ children, onSubscriptionCancel }: ManageSubscriptionButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/billing/portal', { credentials: 'include' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Unable to open billing portal');
      }
      const { url } = (await res.json()) as { url: string };
      const portalWindow = window.open(url, '_blank', 'noopener,noreferrer');

      if (portalWindow) {
        const handleFocus = () => {
          window.removeEventListener('focus', handleFocus);
          onSubscriptionCancel?.();
          window.dispatchEvent(new CustomEvent('subscriptionUpgraded'));
        };
        window.addEventListener('focus', handleFocus);
      } else {
        window.location.href = url;
      }
    } catch (error) {
      console.error('[ManageSubscriptionButton] Failed to open billing portal:', error);
      window.toast?.error('Unable to open billing management. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, onSubscriptionCancel]);

  return React.cloneElement(children, {
    onClick: (e: React.MouseEvent) => {
      children.props.onClick?.(e);
      void handleClick();
    },
    disabled: isLoading || children.props.disabled
  });
}

export default ManageSubscriptionButton;
export { ManageSubscriptionButton as SafeSubscriptionDetailsButton };
