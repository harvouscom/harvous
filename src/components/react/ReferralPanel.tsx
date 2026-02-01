import React, { useState, useEffect } from 'react';
import ButtonSmall from './ButtonSmall';
import SquareButton from './SquareButton';
import { safeFetch } from '@/utils/safe-fetch';

interface ReferralPanelProps {
  onClose?: () => void;
  inBottomSheet?: boolean;
}

interface ReferralStatus {
  referralBonusNotes: number;
  referralCode: string | null;
  limit: number | null;
}

export default function ReferralPanel({
  onClose,
  inBottomSheet = false
}: ReferralPanelProps) {
  const [status, setStatus] = useState<ReferralStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await safeFetch('/api/referral/status', { retries: 1 });
        if (response.ok) {
          const data = await response.json();
          setStatus({
            referralBonusNotes: data.referralBonusNotes ?? 0,
            referralCode: data.referralCode ?? null,
            limit: data.limit ?? null
          });
        }
      } catch (error) {
        console.error('ReferralPanel: Error loading status', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchStatus();
  }, []);

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      window.dispatchEvent(new CustomEvent('closeProfilePanel'));
    }
  };

  const getReferralUrl = (): string => {
    if (typeof window === 'undefined' || !status?.referralCode) return '';
    const base = window.location.origin;
    return `${base}/sign-up?ref=${encodeURIComponent(status.referralCode)}`;
  };

  const handleCopyLink = async () => {
    const url = getReferralUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.dispatchEvent(new CustomEvent('toast', {
        detail: { message: 'Link copied to clipboard', type: 'success' }
      }));
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      window.dispatchEvent(new CustomEvent('toast', {
        detail: { message: 'Failed to copy link', type: 'error' }
      }));
    }
  };

  const referralUrl = getReferralUrl();
  const referralCount = status ? Math.floor(status.referralBonusNotes / 100) : 0;

  return (
    <div className={`referral-panel panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''} w-full`}>
      <div className={inBottomSheet ? 'flex-1 flex flex-col min-h-0' : 'flex flex-col'}>
        <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''}`}>
          <div className="panel__header">
            <div className="panel__title">
              <p>Refer Friends</p>
            </div>
          </div>

          <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
            <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''} panel__content--no-bottom-padding`}>
              <div className="text-center px-4 pt-3 pb-2" style={{ color: 'var(--color-pebble-grey)', fontSize: '14px', textWrap: 'balance' }}>
                When friends sign up with your link, you get 100 more notes. They get 1,000 free notes like everyone else.
              </div>

              {isLoading ? (
                <div className="referral-panel__placeholder">
                  <span>Loading your link...</span>
                </div>
              ) : referralUrl ? (
                <>
                  <div className="referral-panel__link-container">
                    <input
                      type="text"
                      readOnly
                      value={referralUrl}
                      className="referral-panel__link-input"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <ButtonSmall type="button" onClick={handleCopyLink} disabled={isLoading} state="Default">
                      {copied ? 'Copied' : 'Copy'}
                    </ButtonSmall>
                  </div>
                  {referralCount > 0 && (
                    <p className="referral-panel__stats" style={{ marginTop: '1rem', fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-stone-grey)' }}>
                      You&apos;ve earned {status!.referralBonusNotes} bonus notes from {referralCount} successful referral{referralCount !== 1 ? 's' : ''}.
                    </p>
                  )}
                </>
              ) : (
                <div className="referral-panel__placeholder">
                  <span>Unable to load referral link. Please try again.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="panel__footer--buttons">
        <SquareButton variant="Back" onClick={handleClose} inBottomSheet={inBottomSheet} />
      </div>

      <style>{`
        .referral-panel .panel__content::after {
          height: 0;
        }

        .referral-panel__link-container {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          background: var(--color-gradient-gray);
          border-radius: 1.5rem;
        }

        .referral-panel__link-container .btn {
          flex-shrink: 0;
        }

        .referral-panel__link-input {
          flex: 1;
          min-width: 0;
          border: none;
          background: transparent;
          font-size: 0.875rem;
          line-height: 1.25rem;
          color: var(--color-deep-grey);
          outline: none;
          text-overflow: ellipsis;
          font-family: var(--font-sans);
        }

        .referral-panel__placeholder {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem;
          background: var(--color-gradient-gray);
          border-radius: 0.75rem;
          font-size: 13px;
          color: var(--color-stone-grey);
          font-family: var(--font-sans);
        }
      `}</style>
    </div>
  );
}
