import React, { useState, useEffect } from 'react';
import SquareButton from './SquareButton';
import { getCachedPanelData, setCachedPanelData, PANEL_CACHE_KEYS } from '@/utils/panel-data-cache';
import SubtleContentMount from './SubtleContentMount';
import { prototypeHref } from '@/lib/prototype-path';

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
    hasSharedSpaces: boolean;
    currentCount: number;
    limit: number | null;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load subscription info when component mounts and on View Transitions
  useEffect(() => {
    const cached = getCachedPanelData<{ hasSharedSpaces: boolean; currentCount: number; limit: number | null }>(PANEL_CACHE_KEYS.subscription);
    if (cached) {
      setSubscriptionInfo({
        hasSharedSpaces: cached.hasSharedSpaces,
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

  const loadSubscriptionInfo = async (backgroundRefetch = false) => {
    if (!backgroundRefetch) setIsLoading(true);
    try {
      const subRes = await fetch('/api/subscription/status', { credentials: 'include', cache: 'no-store' });
      if (subRes.ok) {
        const data = await subRes.json();
        const info = {
          hasSharedSpaces: Boolean(data.hasSharedSpaces),
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
                          {subscriptionInfo.hasSharedSpaces ? 'Shared Spaces is active' : "You're on the free plan"}
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

                    {/* Get Shared Spaces — only show for free plan users */}
                    {subscriptionInfo && !subscriptionInfo.hasSharedSpaces ? (
                      <a
                        href="/upgrade"
                        className="space-button relative rounded-3xl h-[64px] cursor-pointer transition-[scale,shadow] duration-200 pl-4 w-full"
                        style={{ backgroundImage: 'var(--color-gradient-gray)', paddingRight: '8px', textDecoration: 'none', display: 'block', margin: 0 }}
                      >
                        <div className="panel__list-item">
                          <div className="panel__list-item-text">
                            <span className="panel__list-item-label">
                              Get Shared Spaces
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

                    {/* Manage → Settings › Plan (in-app cancel / Polar for payment method) */}
                    {subscriptionInfo && subscriptionInfo.hasSharedSpaces ? (
                      <a
                        href={prototypeHref('settings/addons')}
                        className="space-button relative rounded-3xl h-[64px] cursor-pointer transition-[scale,shadow] duration-200 pl-4 w-full"
                        style={{
                          backgroundImage: 'var(--color-gradient-gray)',
                          paddingRight: '8px',
                          margin: 0,
                          textDecoration: 'none',
                          display: 'block',
                        }}
                      >
                        <div className="panel__list-item">
                          <div className="panel__list-item-text">
                            <span className="panel__list-item-label">Manage Subscription</span>
                          </div>
                          <div className="panel__list-item-icon">
                            <div className="panel__list-item-icon-wrapper">
                              <div className="panel__external-icon">
                                <svg viewBox="0 0 320 512">
                                  <path d="M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z" />
                                </svg>
                              </div>
                            </div>
                          </div>
                        </div>
                      </a>
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

