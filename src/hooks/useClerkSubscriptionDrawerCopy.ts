import { useEffect } from 'react';

/** Harvous copy + light DOM tweaks for Clerk's portaled subscription-details drawer. */
export function useClerkSubscriptionDrawerCopy() {
  useEffect(() => {
    const updateDrawerContent = () => {
      const title = document.querySelector(
        '.cl-drawerTitle[data-localization-key="billing.subscriptionDetails.title"]',
      );
      if (title && title.textContent !== 'Manage Add-On') {
        title.textContent = 'Manage Add-On';
      }

      const description = document.querySelector(
        '.cl-drawerConfirmationDescription[data-localization-key="billing.cancelSubscriptionAccessUntil"]',
      );
      if (description && !(description as HTMLElement).dataset.harvousCancelCopy) {
        const originalText = description.textContent || '';
        (description as HTMLElement).dataset.harvousCancelCopy = '1';
        const dateMatch = originalText.match(/until ([^,]+),/);
        if (dateMatch) {
          const date = dateMatch[1];
          description.textContent = `You can keep using subscription features until ${date}, after which you will no longer have access. After canceling, you'll return to the free plan.`;
        } else if (originalText.trim()) {
          description.textContent = `${originalText.trim()} After canceling, you'll return to the free plan.`;
        }
      }

      const switchButton = document.querySelector(
        '.cl-subscriptionDetailsActionButton[data-localization-key="billing.switchToAnnualWithAnnualPrice"]',
      );
      if (switchButton) {
        const originalText = switchButton.textContent || '';
        if (originalText.includes('annual') && !originalText.includes('Switch to $')) {
          switchButton.textContent = originalText.replace(/\s+annual\s+/i, ' ');
        }
      }
    };

    const observer = new MutationObserver(updateDrawerContent);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    updateDrawerContent();

    return () => observer.disconnect();
  }, []);
}
