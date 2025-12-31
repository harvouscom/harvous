import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import SquareButton from './SquareButton';
import ButtonSmall from './ButtonSmall';
import { toast } from '@/utils/toast';

interface ManageBillingPanelProps {
  onClose?: () => void;
  inBottomSheet?: boolean;
}

export default function ManageBillingPanel({ 
  onClose,
  inBottomSheet = false
}: ManageBillingPanelProps) {
  const [subscriptionInfo, setSubscriptionInfo] = useState<{
    hasUnlimited: boolean;
    currentCount: number;
    limit: number | null;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showDowngradeConfirm, setShowDowngradeConfirm] = useState(false);
  const [isDowngrading, setIsDowngrading] = useState(false);

  // Load subscription info when component mounts
  useEffect(() => {
    loadSubscriptionInfo();
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

  // Handle navigation to Clerk billing portal
  const handleManagePaymentBilling = () => {
    window.location.href = '/user';
  };

  // Handle downgrade confirmation
  const handleDowngradeClick = () => {
    setShowDowngradeConfirm(true);
  };

  const handleCancelDowngrade = () => {
    setShowDowngradeConfirm(false);
  };

  const handleConfirmDowngrade = async () => {
    setIsDowngrading(true);
    try {
      const response = await fetch('/api/billing/downgrade', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Subscription canceled successfully. You will be downgraded to the free plan.');
        setShowDowngradeConfirm(false);
        // Reload subscription info
        await loadSubscriptionInfo();
        // Close panel after a short delay
        setTimeout(() => {
          handleClose();
        }, 1500);
      } else {
        toast.error(data.error || 'Failed to cancel subscription. Please try again.');
        setIsDowngrading(false);
      }
    } catch (error) {
      console.error('ManageBillingPanel: Error downgrading subscription:', error);
      toast.error('Error canceling subscription. Please try again.');
      setIsDowngrading(false);
    }
  };

  return (
    <>
      <div className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''}`}>
        {/* Content area - expands on mobile, fits content on desktop */}
        <div className={inBottomSheet ? "flex-1 flex flex-col min-h-0" : "flex flex-col"}>
          {/* Panel container */}
          <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''}`}>
            {/* Header section */}
            <div className="panel__header">
              <div className="panel__title">
                <p>Manage Billing</p>
              </div>
            </div>
            
            {/* Content area */}
            <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
              <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''}`}>
                
                {/* Subscription Status Display */}
                {!isLoading && subscriptionInfo && (
                  <div className="w-full">
                    <div className="bg-white border border-[var(--color-fog-white)] rounded-2xl p-4 flex items-center gap-3">
                      {subscriptionInfo.hasUnlimited && (
                        <svg className="w-5 h-5 fill-current text-[var(--color-deep-grey)]" viewBox="0 0 640 512">
                          <path d="M0 241.1C0 161 65 96 145.1 96c38.5 0 75.4 15.3 102.6 42.5L320 210.7l72.2-72.2C419.5 111.3 456.4 96 494.9 96C575 96 640 161 640 241.1l0 29.7C640 351 575 416 494.9 416c-38.5 0-75.4-15.3-102.6-42.5L320 301.3l-72.2 72.2C220.5 400.7 183.6 416 145.1 416C65 416 0 351 0 270.9l0-29.7zM274.7 256l-72.2-72.2c-15.2-15.2-35.9-23.8-57.4-23.8C100.3 160 64 196.3 64 241.1l0 29.7c0 44.8 36.3 81.1 81.1 81.1c21.5 0 42.2-8.5 57.4-23.8L274.7 256zm90.5 0l72.2 72.2c15.2 15.2 35.9 23.8 57.4 23.8c44.8 0 81.1-36.3 81.1-81.1l0-29.7c0-44.8-36.3-81.1-81.1-81.1c-21.5 0-42.2 8.5-57.4 23.8L365.3 256z"/>
                        </svg>
                      )}
                      <div>
                        <div className="text-lg font-semibold text-[var(--color-deep-grey)]">
                          {subscriptionInfo.hasUnlimited ? 'Unlimited' : 'Free'}
                        </div>
                        <div className="text-sm text-[var(--color-pebble-grey)]">Active</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Manage Payment Method & Billing Button */}
                <button
                  type="button"
                  onClick={handleManagePaymentBilling}
                  className="space-button relative rounded-3xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 w-full"
                  style={{ backgroundImage: 'var(--color-gradient-gray)', paddingRight: '8px' }}
                >
                  <div className="panel__list-item">
                    <div className="panel__list-item-text">
                      <span className="panel__list-item-label">
                        Manage Payment Method & Billing
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

                {/* Downgrade to Free Button - Only show for unlimited users */}
                {!isLoading && subscriptionInfo && subscriptionInfo.hasUnlimited && (
                  <button
                    type="button"
                    onClick={handleDowngradeClick}
                    className="space-button relative rounded-3xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 w-full"
                    style={{ backgroundImage: 'var(--color-gradient-gray)', paddingRight: '8px' }}
                  >
                    <div className="panel__list-item">
                      <div className="panel__list-item-text">
                        <span className="panel__list-item-label">
                          Downgrade to Free
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
                )}

                {/* Warning text for downgrade */}
                {!isLoading && subscriptionInfo && subscriptionInfo.hasUnlimited && (
                  <div className="panel__footer" style={{ paddingTop: 0, paddingBottom: 0 }}>
                    <p className="text-sm text-[var(--color-pebble-grey)]">
                      {subscriptionInfo.currentCount > 1000 
                        ? `You have ${subscriptionInfo.currentCount} notes. After downgrading, you won't be able to create new notes until you delete some.`
                        : 'After downgrading, you will be limited to 1,000 notes.'}
                    </p>
                  </div>
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

      {/* Downgrade Confirmation Dialog - Rendered via Portal */}
      {showDowngradeConfirm && typeof document !== 'undefined' && createPortal(
        <div
          className="modal-overlay-enter"
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1rem',
            backgroundColor: 'rgba(0, 0, 0, 0.35)',
            paddingTop: 'max(1rem, env(safe-area-inset-top))',
            paddingBottom: 'max(1rem, env(safe-area-inset-bottom))'
          }}
          onClick={(e) => {
            // Close dialog if clicking on the overlay (but not the dialog content)
            if (e.target === e.currentTarget && !isDowngrading) {
              handleCancelDowngrade();
            }
          }}
        >
          <div 
            className="modal-content-enter"
            onClick={(e) => e.stopPropagation()}
            style={{ 
              backgroundColor: 'white',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              maxWidth: '28rem',
              width: '100%',
              pointerEvents: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}
          >
            <h3 style={{
              fontSize: '1.125rem',
              fontWeight: 600,
              color: 'var(--color-deep-grey)',
              marginBottom: '0.5rem'
            }}>
              Downgrade to Free?
            </h3>
            <p style={{
              color: 'var(--color-pebble-grey)',
              marginBottom: '1.5rem'
            }}>
              {subscriptionInfo && subscriptionInfo.currentCount > 1000 
                ? `You have ${subscriptionInfo.currentCount} notes. After downgrading, you won't be able to create new notes until you delete some. Your subscription will be canceled and you'll be moved to the free plan.`
                : 'Your subscription will be canceled and you\'ll be moved to the free plan, which is limited to 1,000 notes.'}
            </p>
            <div style={{
              display: 'flex',
              gap: '0.75rem',
              justifyContent: 'flex-end',
              flexWrap: 'wrap'
            }}>
              <ButtonSmall
                type="button"
                onClick={handleCancelDowngrade}
                state="Secondary"
                disabled={isDowngrading}
              >
                Cancel
              </ButtonSmall>
              <ButtonSmall
                type="button"
                onClick={handleConfirmDowngrade}
                state="Delete"
                disabled={isDowngrading}
              >
                {isDowngrading ? 'Downgrading...' : 'Downgrade to Free'}
              </ButtonSmall>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

