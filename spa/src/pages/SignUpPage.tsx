import { isSiteInspiredAuthHost } from '@/lib/prototype-path';
import { useAuth } from '@clerk/clerk-react';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import ClerkPrebuiltAuth from '../components/auth/ClerkPrebuiltAuth';
import ClassicAuthMeshColumn from '../components/auth/ClassicAuthMeshColumn';
import HarvousAuthForm from '../components/auth/HarvousAuthForm';
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

  if (isSignedIn || (!isLoaded && /(?:^|;\s*)__client_uat=[1-9]/.test(document.cookie))) {
    return null;
  }

  if (siteInspired) {
    return (
      <div id="sign-up-content" className="auth-page auth-page--site">
        <div className="auth-page__container">
          <div className="auth-page__video-section thread-colors-mesh-gradient">
            <div className="auth-page__video-overlay" style={{ padding: '24px' }}>
              <a href="https://harvous.com" className="auth-page__logo-container">
                <img
                  src="/icons/app-icon.png"
                  alt="Harvous"
                  className="auth-page__logo sign-in-logo"
                  width={22}
                  height={22}
                />
              </a>
            </div>
          </div>

          <div className="auth-page__form-section">
            <div className="auth-page__content-wrapper">
              <h1 className="auth-page__headline">
                Create <span className="auth-page__headline-mark">your</span> study Bible.
              </h1>
              <div className="auth-page__form-wrapper">
                <HarvousAuthForm mode="signUp" redirectRaw={redirectRaw} />
              </div>
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
