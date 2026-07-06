/** Any Clerk billing drawer (checkout or subscription details) is portaled open. */
export function isClerkDrawerOpen(): boolean {
  if (typeof document === 'undefined') return false;
  return Boolean(document.querySelector('.cl-drawerRoot, .cl-drawerContent'));
}

/** Checkout drawer only — used so manage-billing does not flip /addon back to "Add Shared Spaces". */
export function isClerkCheckoutDrawerOpen(): boolean {
  if (typeof document === 'undefined') return false;
  const drawer = document.querySelector('.cl-drawerRoot, .cl-drawerContent');
  if (!drawer) return false;
  return Boolean(
    drawer.querySelector(
      '[data-localization-key="billing.checkout.title"], [data-localization-key="commerce.checkout.title"], .cl-checkoutSuccessTitle, .cl-checkout-root',
    ),
  );
}

function whenDrawerClosed(isOpen: () => boolean): Promise<void> {
  if (typeof document === 'undefined' || !isOpen()) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (!isOpen()) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

/** Resolve after any Clerk billing drawer unmounts. */
export function whenClerkDrawerClosed(): Promise<void> {
  return whenDrawerClosed(isClerkDrawerOpen);
}

/** Resolve after the checkout drawer unmounts (post-payment success step). */
export function whenClerkCheckoutDrawerClosed(): Promise<void> {
  return whenDrawerClosed(isClerkCheckoutDrawerOpen);
}
