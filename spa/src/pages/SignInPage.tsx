import { isSiteInspiredAuthHost } from '@/lib/prototype-path';
import { useAuth } from '@clerk/clerk-react';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import DevModeBadge from '../components/DevModeBadge';
import ClerkPrebuiltAuth from '../components/auth/ClerkPrebuiltAuth';
import ClassicAuthMeshColumn from '../components/auth/ClassicAuthMeshColumn';
import HarvousAuthForm from '../components/auth/HarvousAuthForm';
import { useClerkSignInSubtitlePatch } from '../hooks/useClerkSignInSubtitlePatch';
import { useAuthHeroImage } from '../hooks/useAuthHeroImage';
import { hasClerkSessionCookieHint } from '../hooks/queries/useProfile';
import { postAuthRedirectPath } from '../utils/post-auth-redirect';

export default function SignInPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const navigate = useNavigate();
  const siteInspired = isSiteInspiredAuthHost();
  const { heroImage, isReady: isHeroReady } = useAuthHeroImage();

  useClerkSignInSubtitlePatch(!siteInspired);

  // Redirect if already signed in.
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get('redirect_url');
      const path = postAuthRedirectPath(raw);
      navigate({ to: path as any });
    }
  }, [isLoaded, isSignedIn, navigate]);

  const params = new URLSearchParams(window.location.search);
  const redirectRaw = params.get('redirect_url');
  const signUpHref = redirectRaw
    ? `/sign-up?redirect_url=${encodeURIComponent(redirectRaw)}`
    : '/sign-up';

  if (isSignedIn || (!isLoaded && hasClerkSessionCookieHint())) {
    return null;
  }

  if (siteInspired) {
    return (
      <div id="sign-in-content" className="auth-page auth-page--site">
        <DevModeBadge />
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
                  Open <span className="auth-page__headline-mark">your</span> study Bible.
                </h1>
                <div className="auth-page__form-wrapper">
                  <HarvousAuthForm mode="signIn" />
                </div>
              </div>
            </div>

            <div className="auth-page__footer">
              <p className="auth-page__footer-switch">
                Don't have an account?<a href={signUpHref}>Sign up →</a>
              </p>
              <p className="auth-page__secured-by">Secured by Clerk</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="sign-in-content" className="auth-page auth-page--classic">
      <div className="auth-page__container">
        <ClassicAuthMeshColumn />
        <div className="auth-page__form-section">
          <div className="auth-page__form-wrapper">
            <ClerkPrebuiltAuth mode="signIn" redirectRaw={redirectRaw} />
          </div>
        </div>
      </div>
    </div>
  );
}
