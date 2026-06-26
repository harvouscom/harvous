import { isSiteInspiredAuthHost } from '@/lib/prototype-path';
import { useAuth } from '@clerk/clerk-react';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import ClerkPrebuiltAuth from '../components/auth/ClerkPrebuiltAuth';
import ClassicAuthMeshColumn from '../components/auth/ClassicAuthMeshColumn';
import HarvousAuthForm from '../components/auth/HarvousAuthForm';
import { hasClerkSessionCookieHint } from '../hooks/queries/useProfile';
import { useAuthHeroImage } from '../hooks/useAuthHeroImage';
import { postAuthRedirectPath } from '../utils/post-auth-redirect';

/** Mirror of Astro sign-up.astro: persist ?ref= code as a cookie so
 *  ReferralCreditInit can credit the referrer after the user signs up. */
function useReferralCookie() {
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (!ref?.trim()) return;
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `harvous_referrer=${encodeURIComponent(ref.trim())}; path=/; expires=${expires}; SameSite=Lax`;
  }, []);
}

export default function SignUpPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const navigate = useNavigate();
  const siteInspired = isSiteInspiredAuthHost();
  const { heroImage, isReady: isHeroReady } = useAuthHeroImage();
  useReferralCookie();

  // Redirect if already signed in.
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      const params = new URLSearchParams(window.location.search);
      const path = postAuthRedirectPath(params.get('redirect_url'));
      navigate({ to: path as any });
    }
  }, [isLoaded, isSignedIn, navigate]);

  const params = new URLSearchParams(window.location.search);
  const redirectRaw = params.get('redirect_url');
  const signInHref = redirectRaw
    ? `/sign-in?redirect_url=${encodeURIComponent(redirectRaw)}`
    : '/sign-in';

  if (isSignedIn || (!isLoaded && hasClerkSessionCookieHint())) {
    return null;
  }

  const isDevClerk = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_');

  if (siteInspired) {
    return (
      <div id="sign-up-content" className="auth-page auth-page--site">
        {isDevClerk ? <div className="proto-dev-badge">DEV</div> : null}
        <div className="auth-page__container">
          <div className="auth-page__video-section">
            <div
              className={`auth-page__hero-bg${isHeroReady ? ' auth-page__hero-bg--ready' : ''}`}
              style={isHeroReady ? { backgroundImage: `url(${heroImage})` } : undefined}
              aria-hidden
            />
            <div className="auth-page__video-overlay">
              <a href="https://harvous.com" className="auth-page__logo-container">
                <img
                  src="/images/harvous-2-icon.png"
                  alt="Harvous"
                  className="auth-page__logo"
                  width={64}
                  height={64}
                />
              </a>
            </div>
          </div>

          <div className="auth-page__form-section">
            <div className="auth-letter-stack">
              <div className="auth-letter-stack__leaf auth-letter-stack__leaf--back" aria-hidden />
              <div className="auth-letter-stack__leaf auth-letter-stack__leaf--mid" aria-hidden />
              <div className="auth-letter">
                <h1 className="auth-page__headline">
                  Make <span className="auth-page__headline-mark">your</span> study Bible.
                </h1>
                <div className="auth-page__form-wrapper">
                  <HarvousAuthForm mode="signUp" />
                </div>
              </div>
            </div>

            <div className="auth-page__footer">
              <p className="auth-page__footer-switch">
                Already have an account?<a href={signInHref}>Log in →</a>
              </p>
              <p className="auth-page__secured-by">Secured by Clerk</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="sign-up-content" className="auth-page auth-page--classic">
      <div className="auth-page__container">
        <ClassicAuthMeshColumn />
        <div className="auth-page__form-section">
          <div className="auth-page__form-wrapper">
            <ClerkPrebuiltAuth mode="signUp" redirectRaw={redirectRaw} />
          </div>
        </div>
      </div>
    </div>
  );
}
