import type { Theme } from '@clerk/types';

/** Shared with `.upgrade-primary-btn` / `.upgrade-secondary-btn` (upgrade-page.css). */
export const CLERK_BILLING_DRAWER_FONT_STACK =
  '"Google Sans", "Reddit Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

const GRADIENT_PRIMARY = {
  fontFamily: CLERK_BILLING_DRAWER_FONT_STACK,
  fontWeight: 600,
  color: '#ffffff',
  background: 'linear-gradient(171deg, #2bb5ff 7%, #006eff 93%)',
  borderRadius: '999px',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 10px 24px -10px rgba(0, 110, 255, 0.6)',
  '&:hover': { filter: 'brightness(1.05)', color: '#ffffff' },
  '&:active': { filter: 'brightness(0.97)', color: '#ffffff' },
  '&:focus': { color: '#ffffff' },
};

/** Checkout + subscription-details drawers — portaled above Harvous chrome. */
export const CLERK_BILLING_DRAWER_APPEARANCE: Theme = {
  elements: {
    drawerBackdrop: { zIndex: 300 },
    drawerRoot: { zIndex: 300 },
    drawerContent: { zIndex: 300 },
    drawerTitle: {
      fontFamily: CLERK_BILLING_DRAWER_FONT_STACK,
      fontWeight: 600,
      fontSize: '15px',
    },
    drawerBody: { fontFamily: CLERK_BILLING_DRAWER_FONT_STACK },
    drawerFooter: {
      borderTop: 'none',
      boxShadow: 'none',
    },
    formButtonPrimary: GRADIENT_PRIMARY,
    checkoutSuccessTitle: {
      fontFamily:
        '"Google Sans Flex", "Google Sans", ui-sans-serif, system-ui, -apple-system, sans-serif',
      fontWeight: 600,
      fontSize: '1.25rem',
      letterSpacing: '-0.02em',
      lineHeight: 1.2,
    },
    checkoutSuccessDescription: {
      fontFamily: CLERK_BILLING_DRAWER_FONT_STACK,
      fontSize: '0.9375rem',
      lineHeight: 1.55,
    },
    checkoutSuccessBadge: {
      width: '56px',
      height: '56px',
      background: 'transparent',
      backgroundColor: 'transparent',
      color: '#ffffff',
      border: 'none',
      boxShadow: 'none',
    },
    checkoutSuccessRings: {
      display: 'none',
    },
    lineItemsTitle: {
      fontFamily: CLERK_BILLING_DRAWER_FONT_STACK,
      fontSize: '0.8125rem',
      fontWeight: 500,
    },
    lineItemsDescription: {
      fontFamily: CLERK_BILLING_DRAWER_FONT_STACK,
      fontSize: '0.8125rem',
      fontWeight: 600,
    },
    subscriptionDetailsCardTitle: {
      fontFamily:
        '"Google Sans Flex", "Google Sans", ui-sans-serif, system-ui, -apple-system, sans-serif',
      fontWeight: 600,
      fontSize: '1rem',
      letterSpacing: '-0.01em',
    },
    subscriptionDetailsCardSubtitle: {
      fontFamily: CLERK_BILLING_DRAWER_FONT_STACK,
      fontSize: '0.875rem',
      fontWeight: 500,
    },
    subscriptionDetailsCardBadge: {
      backgroundColor: '#006eff',
      color: '#ffffff',
      borderRadius: '999px',
      fontWeight: 600,
    },
    subscriptionDetailsActionButton: {
      fontFamily: CLERK_BILLING_DRAWER_FONT_STACK,
      fontWeight: 500,
      fontSize: '15px',
      borderRadius: '999px',
    },
    subscriptionDetailsCancelButton: {
      fontFamily: CLERK_BILLING_DRAWER_FONT_STACK,
      fontWeight: 500,
      fontSize: '0.875rem',
    },
  },
};
