import React, { useState, useEffect } from 'react';
import SafeSubscriptionDetailsButton from './SafeSubscriptionDetailsButton';
import SquareButton from './SquareButton';
import { getCachedPanelData, setCachedPanelData, PANEL_CACHE_KEYS } from '@/utils/panel-data-cache';
import SubtleContentMount from './SubtleContentMount';

interface ManageBillingPanelProps {
  onClose?: () => void;
  inBottomSheet?: boolean;
  publishableKey?: string | null;
}

/** Subscription data comes only from /api/subscription/status. Do not add limitsInfo. */
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
    const cached = getCachedPanelData<{ hasUnlimited: boolean; currentCount: number; limit: number | null }>(PANEL_CACHE_KEYS.subscription);
    if (cached) {
      setSubscriptionInfo({
        hasUnlimited: cached.hasUnlimited,
        currentCount: cached.currentCount,
        limit: cached.limit
      });
      setIsLoading(false);
      loadSubscriptionInfo(true);
    } else {
      loadSubscriptionInfo(false);
    }

    // Listen for subscription upgrade events to refresh (background, no loading)
    const handleSubscriptionUpgraded = () => {
      loadSubscriptionInfo(true);
    };
    window.addEventListener('subscriptionUpgraded', handleSubscriptionUpgraded);

    // Refresh when a note is added to a thread or a new note is created so count stays in sync if panel is open
    const handleNoteAddedToThread = () => {
      loadSubscriptionInfo(true);
    };
    const handleNoteCreated = () => {
      loadSubscriptionInfo(true);
    };
    window.addEventListener('noteAddedToThread', handleNoteAddedToThread);
    window.addEventListener('noteCreated', handleNoteCreated);

    // Also refresh on View Transitions (for subsequent visits; background)
    const handlePageLoad = () => {
      loadSubscriptionInfo(true);
    };
    document.addEventListener('app:route-change', handlePageLoad);

    return () => {
      window.removeEventListener('subscriptionUpgraded', handleSubscriptionUpgraded);
      window.removeEventListener('noteAddedToThread', handleNoteAddedToThread);
      window.removeEventListener('noteCreated', handleNoteCreated);
      document.removeEventListener('app:route-change', handlePageLoad);
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

  const loadSubscriptionInfo = async (backgroundRefetch = false) => {
    if (!backgroundRefetch) setIsLoading(true);
    try {
      const subRes = await fetch('/api/subscription/status', { credentials: 'include', cache: 'no-store' });
      if (subRes.ok) {
        const data = await subRes.json();
        const info = {
          hasUnlimited: data.hasUnlimited,
          currentCount: data.currentCount || 0,
          limit: data.limit || null
        };
        setSubscriptionInfo(info);
        setCachedPanelData(PANEL_CACHE_KEYS.subscription, info);
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

        /* Billing limit upgrade links - same hover/active as condensed items */
        .billing-limit-link {
          transition: transform 200ms ease;
        }
        .billing-limit-link:hover {
          transform: scale(1.002);
        }
        .billing-limit-link:active {
          transform: scale(0.99);
        }

      `}</style>
      <div className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''}`}>
        {/* Content area - expands on mobile, fits content on desktop */}
        <div className={inBottomSheet ? "flex-fill flex-stack" : "flex-stack"} style={{ gap: 0, position: 'relative' }}>
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
              <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''}`}>
                <div className="panel__content-scroll" style={{ gap: '12px' }}>
                {isLoading ? (
                  <div className="w-full p-8 text-center">
                    <p className="font-sans" style={{ color: 'var(--color-pebble-grey)', fontSize: '16px' }}>
                      Loading…
                    </p>
                  </div>
                ) : (
                  <SubtleContentMount>
                    {/* Subscription Status Display */}
                    {subscriptionInfo ? (
                      <div className="w-full">
                        <div
                          className="font-sans text-center px-4 pt-3 pb-2"
                          style={{ color: 'var(--color-pebble-grey)', fontSize: '16px', textWrap: 'balance', marginBottom: 12 }}
                        >
                          {subscriptionInfo.hasUnlimited ? "You're on the Unlimited plan" : "You're on the free plan"}
                        </div>
                        <div className="flex-stack" style={{ gap: 12, marginBottom: 12 }}>
                          <div
                            className="bg-white rounded-xl p-3 flex-row"
                            style={{
                              gap: '0.75rem',
                              border: '1px solid',
                              borderColor: 'var(--color-fog-white)'
                            }}
                          >
                            <div className="min-w-0 flex-1 text-left">
                              <span className="text-base font-semibold" style={{ color: 'var(--color-deep-grey)' }}>
                                Unlimited notes
                              </span>
                              <span className="block text-xs mt-1" style={{ color: 'var(--color-pebble-grey)' }}>
                                {subscriptionInfo.currentCount.toLocaleString()} notes in your library
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {/* Upgrade to Unlimited Button - Only show for free plan users */}
                    {subscriptionInfo && !subscriptionInfo.hasUnlimited ? (
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
                    ) : null}

                    {/* Manage Payment Method & Billing Button - Only show for unlimited plan users */}
                    {subscriptionInfo && subscriptionInfo.hasUnlimited ? (
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
                    ) : null}
                  </SubtleContentMount>
                )}
                </div>
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

