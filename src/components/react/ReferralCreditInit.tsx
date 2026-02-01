import { useEffect, useRef } from 'react';

const COOKIE_NAME = 'harvous_referrer';

function hasReferrerCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.includes(`${COOKIE_NAME}=`);
}

interface ReferralCreditInitProps {
  userId: string | undefined;
}

/**
 * Calls POST /api/referral/credit once when the user is authenticated and
 * the harvous_referrer cookie is present (set by sign-up page when ref= in URL).
 * The API credits the referrer and clears the cookie.
 */
export default function ReferralCreditInit({ userId }: ReferralCreditInitProps) {
  const calledRef = useRef(false);

  useEffect(() => {
    if (!userId || calledRef.current || !hasReferrerCookie()) return;
    calledRef.current = true;

    fetch('/api/referral/credit', {
      method: 'POST',
      credentials: 'same-origin'
    }).catch((err) => {
      console.error('Referral credit request failed:', err);
      calledRef.current = false;
    });
  }, [userId]);

  return null;
}
