import React, { useState, useEffect } from 'react';
import SafeSubscriptionDetailsButton from './SafeSubscriptionDetailsButton';
import SquareButton from './SquareButton';

interface ManageBillingPanelProps {
  onClose?: () => void;
  inBottomSheet?: boolean;
  publishableKey?: string | null;
}

export default function ManageBillingPanel({ 
  onClose,
  inBottomSheet = false,
  publishableKey = null
}: ManageBillingPanelProps) {
  const [subscriptionInfo, setSubscriptionInfo] = useState<{
    hasUnlimited: boolean;
    currentCount: number;
    limit: number | null;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load subscription info when component mounts and on View Transitions
  useEffect(() => {
    // Load on initial mount
    loadSubscriptionInfo();
    
    // Listen for subscription upgrade events to refresh
    const handleSubscriptionUpgraded = () => {
      loadSubscriptionInfo();
    };
    window.addEventListener('subscriptionUpgraded', handleSubscriptionUpgraded);
    
    // Also refresh on View Transitions (for subsequent visits)
    const handlePageLoad = () => {
      loadSubscriptionInfo();
    };
    document.addEventListener('astro:page-load', handlePageLoad);
    
    return () => {
      window.removeEventListener('subscriptionUpgraded', handleSubscriptionUpgraded);
      document.removeEventListener('astro:page-load', handlePageLoad);
    };
  }, []);

  // Update Clerk drawer title and description text when it opens
  useEffect(() => {
    const updateDrawerContent = () => {
      // Update drawer title
      const title = document.querySelector('.cl-drawerTitle[data-localization-key="billing.subscriptionDetails.title"]');
      if (title && title.textContent !== 'Manage Billing') {
        title.textContent = 'Manage Billing';
      }

      // Update drawer description
      const description = document.querySelector('.cl-drawerConfirmationDescription[data-localization-key="billing.cancelSubscriptionAccessUntil"]');
      if (description) {
        const originalText = description.textContent || '';
        // Check if we've already updated it (avoid infinite loop)
        if (!originalText.includes('500 notes')) {
          // Extract the date part from the original text
          const dateMatch = originalText.match(/until ([^,]+),/);
          if (dateMatch) {
            const date = dateMatch[1];
            description.textContent = `You can keep using 'Unlimited' features until ${date}, after which you will no longer have access. After canceling, you'll be moved to the free plan, which is limited to 500 notes.`;
          } else {
            // Fallback if date format is different
            description.textContent = originalText + " After canceling, you'll be moved to the free plan, which is limited to 500 notes.";
          }
        }
      }

      // Ensure Clerk drawer has high z-index to appear above bottom sheet
      // Only set z-index, don't change positioning to avoid breaking drawer
      const drawerElements = document.querySelectorAll('[class*="cl-drawer"], [class*="cl-drawerContent"], [class*="cl-drawerBody"]');
      drawerElements.forEach((el) => {
        const htmlEl = el as HTMLElement;
        htmlEl.style.zIndex = '200';
      });
    };

    // Watch for drawer opening using MutationObserver
    const observer = new MutationObserver(() => {
      updateDrawerContent();
    });

    // Observe the document body for changes
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Also try immediately in case drawer is already open
    updateDrawerContent();

    return () => {
      observer.disconnect();
    };
  }, []);

  // Update "Switch to annual" button text to remove "annual"
  useEffect(() => {
    const updateSwitchButtonText = () => {
      const switchButton = document.querySelector('.cl-subscriptionDetailsActionButton[data-localization-key="billing.switchToAnnualWithAnnualPrice"]');
      if (switchButton) {
        const originalText = switchButton.textContent || '';
        // Check if we've already updated it (avoid infinite loop)
        if (originalText.includes('annual') && !originalText.includes('Switch to $')) {
          // Remove "annual" from the text, e.g., "Switch to annual $39 / year" -> "Switch to $39 / year"
          const updatedText = originalText.replace(/\s+annual\s+/i, ' ');
          switchButton.textContent = updatedText;
        }
      }
    };

    // Watch for button appearance using MutationObserver
    const observer = new MutationObserver(() => {
      updateSwitchButtonText();
    });

    // Observe the document body for changes
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // Also try immediately in case button is already present
    updateSwitchButtonText();

    return () => {
      observer.disconnect();
    };
  }, []);

  const loadSubscriptionInfo = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/subscription/status', {
        credentials: 'include',
        cache: 'no-store'
      });

      if (response.ok) {
        const data = await response.json();
        setSubscriptionInfo({
          hasUnlimited: data.hasUnlimited,
          currentCount: data.currentCount || 0,
          limit: data.limit || null
        });
      }
    } catch (error) {
      console.error('ManageBillingPanel: Error loading subscription info:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle close
  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      window.dispatchEvent(new CustomEvent('closeProfilePanel'));
    }
  };

  // Note: handleManagePaymentBilling is no longer needed
  // SubscriptionDetailsButton handles the click and opens the drawer


  return (
    <>
      <style>{`
        /* Style Clerk drawer buttons to match ButtonSmall */
        .cl-drawerFooter .cl-button[data-variant="solid"][data-color="danger"] {
          /* ButtonSmall red/danger variant */
          background-color: var(--color-red) !important;
          color: white !important;
          padding: 0.75rem 1rem 1rem !important;
          font-size: 14px !important;
          line-height: 0 !important;
          min-height: 40px !important;
          border-radius: 1rem !important;
          box-shadow:
            0px -4px 0px 0px hsla(0, 0%, 0%, 0.1) inset,
            0px 2px 2px 0px hsla(0, 0%, 0%, 0.25) !important;
          border: none !important;
          font-weight: 600 !important;
        }

        .cl-drawerFooter .cl-button[data-variant="solid"][data-color="danger"]:active {
          background-color: #b30524 !important;
          box-shadow:
            0px -1px 0px 0px rgba(0, 0, 0, 0.1) inset,
            0px 2px 2px 0px hsla(0, 0%, 0%, 0.25) !important;
        }

        .cl-drawerFooter .cl-button[data-variant="solid"][data-color="danger"] * {
          color: white !important;
        }

        .cl-drawerFooter .cl-button[data-variant="ghost"][data-color="primary"] {
          /* ButtonSmall secondary variant */
          background-color: var(--color-stone-grey) !important;
          color: white !important;
          padding: 0.75rem 1rem 1rem !important;
          font-size: 14px !important;
          line-height: 0 !important;
          min-height: 40px !important;
          border-radius: 1rem !important;
          box-shadow:
            0px -4px 0px 0px hsla(0, 0%, 0%, 0.1) inset,
            0px 2px 2px 0px hsla(0, 0%, 0%, 0.25) !important;
          border: none !important;
          font-weight: 600 !important;
        }

        .cl-drawerFooter .cl-button[data-variant="ghost"][data-color="primary"]:active {
          background-color: var(--color-deep-grey) !important;
          box-shadow:
            0px -1px 0px 0px rgba(0, 0, 0, 0.1) inset,
            0px 2px 2px 0px hsla(0, 0%, 0%, 0.25) !important;
        }

        .cl-drawerFooter .cl-button[data-variant="ghost"][data-color="primary"] * {
          color: white !important;
        }

        /* Style subscription details action buttons */
        /* Switch to annual button - ButtonSmall secondary variant */
        .cl-subscriptionDetailsActionButton[data-variant="outline"][data-color="primary"],
        .cl-subscriptionDetailsActionButton {
          background-color: var(--color-stone-grey) !important;
          color: white !important;
          padding: 0.75rem 1rem 1rem !important;
          font-size: 14px !important;
          line-height: 0 !important;
          min-height: 40px !important;
          border-radius: 1rem !important;
          box-shadow:
            0px -4px 0px 0px hsla(0, 0%, 0%, 0.1) inset,
            0px 2px 2px 0px hsla(0, 0%, 0%, 0.25) !important;
          border: none !important;
          font-weight: 600 !important;
        }

        .cl-subscriptionDetailsActionButton[data-variant="outline"][data-color="primary"]:active,
        .cl-subscriptionDetailsActionButton:active {
          background-color: var(--color-deep-grey) !important;
          box-shadow:
            0px -2px 0px 0px #0000001a inset,
            0px 0px 2px 0px #00000040,
            0px 2px 0px 0px #00000040 inset !important;
        }

        .cl-subscriptionDetailsActionButton[data-variant="outline"][data-color="primary"] *,
        .cl-subscriptionDetailsActionButton * {
          color: white !important;
        }

        /* Cancel subscription button - ButtonSmall red/danger variant */
        .cl-subscriptionDetailsCancelButton[data-variant="ghost"][data-color="danger"],
        .cl-subscriptionDetailsCancelButton {
          background-color: var(--color-red) !important;
          color: white !important;
          padding: 0.75rem 1rem 1rem !important;
          font-size: 14px !important;
          line-height: 0 !important;
          min-height: 40px !important;
          border-radius: 1rem !important;
          box-shadow:
            0px -4px 0px 0px hsla(0, 0%, 0%, 0.1) inset,
            0px 2px 2px 0px hsla(0, 0%, 0%, 0.25) !important;
          border: none !important;
          font-weight: 600 !important;
        }

        .cl-subscriptionDetailsCancelButton[data-variant="ghost"][data-color="danger"]:active,
        .cl-subscriptionDetailsCancelButton:active {
          background-color: #b30524 !important;
          box-shadow:
            0px -2px 0px 0px #0000001a inset,
            0px 0px 2px 0px #00000040,
            0px 2px 0px 0px #00000040 inset !important;
        }

        .cl-subscriptionDetailsCancelButton[data-variant="ghost"][data-color="danger"] *,
        .cl-subscriptionDetailsCancelButton * {
          color: white !important;
        }

        /* Style subscription details card badge - Active badge */
        .cl-subscriptionDetailsCardBadge[data-color="secondary"],
        .cl-subscriptionDetailsCardBadge {
          background-color: var(--color-bold-blue) !important;
          color: white !important;
          border-radius: 0.75rem !important;
          font-weight: 600 !important;
        }

        .cl-subscriptionDetailsCardBadge[data-color="secondary"] *,
        .cl-subscriptionDetailsCardBadge * {
          color: white !important;
        }

        /* Adjust spacing between confirmation title and description */
        .cl-drawerFooter .cl-drawerConfirmationAction {
          gap: 0 !important;
          display: flex !important;
          flex-direction: column !important;
        }

        .cl-drawerFooter .cl-drawerConfirmationTitle,
        .cl-drawerFooter h2.cl-drawerConfirmationTitle {
          margin: 0 !important;
          margin-bottom: 12px !important;
          padding: 0 !important;
          line-height: 1.2 !important;
        }

        .cl-drawerFooter .cl-drawerConfirmationDescription,
        .cl-drawerFooter p.cl-drawerConfirmationDescription {
          margin: 0 !important;
          padding: 0 !important;
          line-height: 1.4 !important;
        }

        /* Target all possible wrapper elements */
        .cl-drawerFooter .cl-drawerConfirmationAction > * {
          margin-top: 0 !important;
          margin-bottom: 0 !important;
        }

        .cl-drawerFooter .cl-drawerConfirmationAction > h2 {
          margin-bottom: 12px !important;
        }

        /* Ensure Clerk drawer appears above bottom sheet */
        [class*="cl-drawer"],
        [class*="cl-drawerContent"],
        [class*="cl-drawerBody"],
        [class*="cl-internal"][class*="cl-drawer"],
        [class*="cl-internal"][class*="cl-drawerContent"],
        [class*="cl-internal"][class*="cl-drawerBody"] {
          z-index: 200 !important;
        }

      `}</style>
      <div className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''}`}>
        {/* Content area - expands on mobile, fits content on desktop */}
        <div className={inBottomSheet ? "flex-1 flex flex-col min-h-0" : "flex flex-col"}>
          {/* Panel container */}
          <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''}`}>
            {/* Header section */}
            <div className="panel__header">
              <div className="panel__title">
                <p>My Subscription</p>
              </div>
            </div>
            
            {/* Content area */}
            <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
              <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''}`} style={{ gap: '12px' }}>
                
                {/* Subscription Status Display */}
                {!isLoading && subscriptionInfo && (
                  <div className="w-full">
                    <div className="bg-white border border-[var(--color-fog-white)] rounded-2xl p-4 flex items-center gap-3">
                      {subscriptionInfo.hasUnlimited ? (
                        <svg className="w-5 h-5 fill-current text-[var(--color-deep-grey)]" viewBox="0 0 640 512">
                          <path d="M0 241.1C0 161 65 96 145.1 96c38.5 0 75.4 15.3 102.6 42.5L320 210.7l72.2-72.2C419.5 111.3 456.4 96 494.9 96C575 96 640 161 640 241.1l0 29.7C640 351 575 416 494.9 416c-38.5 0-75.4-15.3-102.6-42.5L320 301.3l-72.2 72.2C220.5 400.7 183.6 416 145.1 416C65 416 0 351 0 270.9l0-29.7zM274.7 256l-72.2-72.2c-15.2-15.2-35.9-23.8-57.4-23.8C100.3 160 64 196.3 64 241.1l0 29.7c0 44.8 36.3 81.1 81.1 81.1c21.5 0 42.2-8.5 57.4-23.8L274.7 256zm90.5 0l72.2 72.2c15.2 15.2 35.9 23.8 57.4 23.8c44.8 0 81.1-36.3 81.1-81.1l0-29.7c0-44.8-36.3-81.1-81.1-81.1c-21.5 0-42.2 8.5-57.4 23.8L365.3 256z"/>
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 fill-current text-[var(--color-deep-grey)]" viewBox="0 0 512 512">
                          <path d="M278.5 215.6L23 471c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l57-57 68 0c49.7 0 97.9-14.4 139-41c11.1-7.2 5.5-23-7.8-23c-5.1 0-9.2-4.1-9.2-9.2c0-4.1 2.7-7.6 6.5-8.8l81-24.3c2.5-.8 4.8-2.1 6.7-4l22.4-22.4c10.1-10.1 2.9-27.3-11.3-27.3l-32.2 0c-5.1 0-9.2-4.1-9.2-9.2c0-4.1 2.7-7.6 6.5-8.8l112-33.6c4-1.2 7.4-3.9 9.3-7.7C506.4 207.6 512 184.1 512 160c0-41-16.3-80.3-45.3-109.3l-5.5-5.5C432.3 16.3 393 0 352 0s-80.3 16.3-109.3 45.3L139 149C91 197 64 262.1 64 330l0 55.3L253.6 195.8c6.2-6.2 16.4-6.2 22.6 0c5.4 5.4 6.1 13.6 2.2 19.8z"/>
                        </svg>
                      )}
                      <div>
                        <div className="text-lg font-semibold text-[var(--color-deep-grey)]">
                          {subscriptionInfo.hasUnlimited ? 'Unlimited' : 'Free'}
                        </div>
                        <div className="text-sm text-[var(--color-pebble-grey)]">
                          {subscriptionInfo.hasUnlimited 
                            ? 'Active' 
                            : `You've used ${subscriptionInfo.currentCount.toLocaleString()} out of the 500 note limit`}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Upgrade to Unlimited Button - Only show for free plan users */}
                {!isLoading && subscriptionInfo && !subscriptionInfo.hasUnlimited && (
                  <a
                    href="/upgrade"
                    className="space-button relative rounded-3xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 w-full"
                    style={{ backgroundImage: 'var(--color-gradient-gray)', paddingRight: '8px', textDecoration: 'none', display: 'block', margin: 0 }}
                  >
                    <div className="panel__list-item">
                      <div className="panel__list-item-text">
                        <span className="panel__list-item-label">
                          Upgrade to Unlimited
                        </span>
                      </div>
                      <div className="panel__list-item-icon">
                        <div className="panel__list-item-icon-wrapper">
                          <div className="panel__external-icon">
                            <svg viewBox="0 0 320 512">
                              <path d="M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z"/>
                            </svg>
                          </div>
                        </div>
                      </div>
                    </div>
                  </a>
                )}

                {/* Manage Payment Method & Billing Button - Only show for unlimited plan users */}
                {/* SafeSubscriptionDetailsButton handles Clerk context availability check */}
                {!isLoading && subscriptionInfo && subscriptionInfo.hasUnlimited && (
                  <SafeSubscriptionDetailsButton publishableKey={publishableKey}>
                    <button
                      type="button"
                      className="space-button relative rounded-3xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 w-full"
                      style={{ backgroundImage: 'var(--color-gradient-gray)', paddingRight: '8px', margin: 0 }}
                    >
                      <div className="panel__list-item">
                        <div className="panel__list-item-text">
                          <span className="panel__list-item-label">
                            Manage Billing
                          </span>
                        </div>
                        <div className="panel__list-item-icon">
                          <div className="panel__list-item-icon-wrapper">
                            <div className="panel__external-icon">
                              <svg viewBox="0 0 320 512">
                                <path d="M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z"/>
                              </svg>
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  </SafeSubscriptionDetailsButton>
                )}

              </div>
            </div>
          </div>
        </div>

        {/* Bottom buttons */}
        <div className="panel__footer--buttons">
          {/* Back button - SquareButton Back variant */}
          <SquareButton 
            variant="Back"
            onClick={handleClose}
            inBottomSheet={inBottomSheet}
          />
        </div>
      </div>

    </>
  );
}

