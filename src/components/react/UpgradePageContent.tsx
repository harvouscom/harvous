// @ts-ignore - React hooks are available, this is a linter cache issue
import React, { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import Icon from './Icon';
import SafeSubscriptionDetailsButton from './SafeSubscriptionDetailsButton';
import UpgradeCheckoutButton from './UpgradeCheckoutButton';

interface UpgradePageContentProps {
  initialHasSharedSpaces: boolean;
  publishableKey?: string | null;
  sharedSpacesPlanId?: string;
  /** Dev design gallery — bypasses Clerk for static previews. */
  designPreview?: { signedIn: boolean };
}

const FEATURES = [
  'Create shared spaces and invite others to study with you',
  'Everyone contributes notes to the shared space',
  'Joining a space is always free',
];

const PRODUCT_NAME = 'Shared Spaces';

const ACTIVE_TAGLINE = `${PRODUCT_NAME} is active on your account. Here's a reminder of what it includes:`;
const PURCHASE_TAGLINE =
  'Study with others in shared spaces where everyone contributes notes together.';

/**
 * Single-purpose Shared Spaces upgrade card — paper-stack letter layout
 * matching shared-note / sign-in pages. The old multi-add-on list lives in
 * Settings > Add-ons.
 */
export default function UpgradePageContent({
  initialHasSharedSpaces,
  publishableKey,
  sharedSpacesPlanId,
  designPreview,
}: UpgradePageContentProps) {
  const { isSignedIn: clerkSignedIn, has } = useAuth();
  const isSignedIn = designPreview?.signedIn ?? clerkSignedIn;
  const [hasSharedSpaces, setHasSharedSpaces] = useState(initialHasSharedSpaces);
  const clerkHasSharedSpaces = isSignedIn ? has({ feature: 'shared_spaces' }) : false;
  const showActiveCopy = hasSharedSpaces || clerkHasSharedSpaces;

  const checkStatus = async () => {
    try {
      const subRes = await fetch('/api/subscription/status', { credentials: 'include', cache: 'no-store' });

      if (subRes.ok) {
        const data = await subRes.json();
        setHasSharedSpaces(Boolean(data.hasSharedSpaces));
      }
    } catch (error) {
      console.error('[UpgradePageContent] Error checking status:', error);
    }
  };

  useEffect(() => {
    if (designPreview) return;
    checkStatus();

    const handleUpgrade = () => checkStatus();
    window.addEventListener('subscriptionUpgraded', handleUpgrade);

    const handlePageLoad = () => {
      if (window.location.pathname === '/addon') {
        checkStatus();
      }
    };
    document.addEventListener('app:route-change', handlePageLoad);

    return () => {
      window.removeEventListener('subscriptionUpgraded', handleUpgrade);
      document.removeEventListener('app:route-change', handlePageLoad);
    };
  }, [designPreview]);

  const handleSubscriptionCancel = () => {
    void checkStatus();
    window.dispatchEvent(new CustomEvent('subscriptionUpgraded'));
  };

  const redirectUrl =
    typeof window !== 'undefined' ? encodeURIComponent(window.location.href) : encodeURIComponent('/addon');
  const signInHref = `/sign-in?redirect_url=${redirectUrl}`;

  return (
    <>
      <div className="public-paper-stack public-paper-stack--upgrade">
        <div className="public-paper-stack__leaf public-paper-stack__leaf--back" aria-hidden />
        <div className="public-paper-stack__leaf public-paper-stack__leaf--mid" aria-hidden />
        <article className="public-addon-letter">
          <div className="public-addon-letter__header">
            <span className="public-addon-letter__icon" aria-hidden>
              <Icon name="user-group" size={22} />
            </span>
            <h1 className="public-addon-letter__title">{PRODUCT_NAME}</h1>
            <p className="public-addon-letter__tagline">
              {showActiveCopy ? ACTIVE_TAGLINE : PURCHASE_TAGLINE}
            </p>
          </div>

          <ul className="public-addon-letter__features" role="list">
            {FEATURES.map((feature) => (
              <li key={feature}>
                <span className="public-addon-letter__check" aria-hidden="true">
                  <Icon name="check" size={11} />
                </span>
                <span className="public-addon-letter__feature-text">{feature}</span>
              </li>
            ))}
          </ul>

          <div className="public-addon-letter__cta">
            {hasSharedSpaces ? (
              <>
                <a href="/" className="upgrade-primary-btn">
                  Back to My Harvous
                </a>
                <SafeSubscriptionDetailsButton
                  publishableKey={publishableKey}
                  onSubscriptionCancel={handleSubscriptionCancel}
                >
                  <button type="button" className="upgrade-secondary-btn">
                    Manage Add-On
                  </button>
                </SafeSubscriptionDetailsButton>
              </>
            ) : isSignedIn ? (
              <UpgradeCheckoutButton
                className="upgrade-checkout"
                publishableKey={publishableKey}
                planId={sharedSpacesPlanId}
                ctaLabel={`Add ${PRODUCT_NAME}`}
                priceMonthlyLabel="$6 per month"
                priceAnnualLabel="$48 per year"
              />
            ) : (
              <a href={signInHref} className="upgrade-primary-btn">
                Sign in to add
              </a>
            )}
          </div>
        </article>
      </div>

      <div className="public-footer public-footer--rich">
        <span className="public-footer__tag">
          Questions?{' '}
          <a href="mailto:derek@harvous.com" className="public-footer__cta">
            derek@harvous.com
          </a>
        </span>
      </div>
    </>
  );
}
