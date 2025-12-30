'use client';

interface CheckoutButtonProps {
  planId: string;
  planPeriod?: 'month' | 'year';
  className?: string;
  children: React.ReactNode;
}

/**
 * CheckoutButton component
 * 
 * Note: Clerk Billing checkout functionality is not yet available in the current
 * SDK versions. This component provides a placeholder that can be updated when
 * Clerk releases the billing checkout APIs/components.
 * 
 * For now, this redirects to the user profile billing page where users can
 * manage their subscriptions through Clerk's built-in UI.
 */
export default function CheckoutButton({ 
  planId, 
  planPeriod = 'year',
  className = '',
  children 
}: CheckoutButtonProps) {
  const handleCheckout = () => {
    // Redirect to Clerk's user profile billing page
    // Users can subscribe to plans from there
    // TODO: Update this when Clerk releases billing checkout APIs
    window.location.href = '/user';
  };

  return (
    <button
      onClick={handleCheckout}
      className={className}
    >
      {children}
    </button>
  );
}
