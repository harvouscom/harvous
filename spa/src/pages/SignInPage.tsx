import { isSiteInspiredAuthHost } from '@/lib/prototype-path';
import { useAuth, useClerk } from '@clerk/clerk-react';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import DevModeBadge from '../components/DevModeBadge';
import ClerkPrebuiltAuth from '../components/auth/ClerkPrebuiltAuth';
import ClassicAuthMeshColumn from '../components/auth/ClassicAuthMeshColumn';
import HarvousAuthForm from '../components/auth/HarvousAuthForm';
import { useClerkSignInSubtitlePatch } from '../hooks/useClerkSignInSubtitlePatch';
import { useAuthHeroImage } from '../hooks/useAuthHeroImage';
import { clearUserClientStorageCaches } from '@/utils/clear-user-client-caches';
import { deletePersistedQueryCache } from '@/utils/query-cache-persistence';
import { useQueryClient } from '@tanstack/react-query';
import { postAuthDestination } from '../lib/notification-return';

export default function SignInPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const clerk = useClerk();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fromChild = new URLSearchParams(window.location.search).get('child_return') === '1';
  const finishingChildReturn = useRef(false);
  const [childReturnError, setChildReturnError] = useState(false);
  const [retryChildReturn, setRetryChildReturn] = useState(0);
  const siteInspired = isSiteInspiredAuthHost();
  const { heroImage, isReady: isHeroReady } = useAuthHeroImage();

  useClerkSignInSubtitlePatch(!siteInspired);

  // A child can open a handoff link in a browser that still has an adult session.
  // Clear that session before the sign-in page can redirect into the adult app.
  useEffect(() => {
    if (!isLoaded || !fromChild || finishingChildReturn.current) return;
    finishingChildReturn.current = true;
    const destination = '/sign-in?redirect_url=%2Fsettings%2Fchild-accounts';
    if (!isSignedIn) { window.location.replace(destination); return; }
    void (async () => {
      try {
        await queryClient.cancelQueries();
        clearUserClientStorageCaches();
        await deletePersistedQueryCache();
        await clerk.signOut();
        queryClient.clear();
        window.location.replace(destination);
      } catch {
        finishingChildReturn.current = false;
        setChildReturnError(true);
      }
    })();
  }, [clerk, fromChild, isLoaded, isSignedIn, queryClient, retryChildReturn]);

  // Redirect if already signed in.
  useEffect(() => {
    if (isLoaded && isSignedIn && !fromChild) {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get('redirect_url');
      const path = postAuthDestination(raw);
      navigate({ to: path as any });
    }
  }, [isLoaded, isSignedIn, navigate, fromChild]);

  const params = new URLSearchParams(window.location.search);
  const redirectRaw = params.get('redirect_url');
  const signUpHref = redirectRaw
    ? `/sign-up?redirect_url=${encodeURIComponent(redirectRaw)}`
    : '/sign-up';

  if (fromChild) return <div className="auth-page auth-page--classic">
    {childReturnError ? <div role="alert">
      <p>We couldn’t open a fresh sign-in. Please try again.</p>
      <button type="button" onClick={() => { setChildReturnError(false); setRetryChildReturn(value => value + 1); }}>Try again</button>
    </div> : <p role="status">Opening parent sign-in…</p>}
  </div>;

  if (isLoaded && isSignedIn) return null;

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
                  src="/images/icons/icon-192.png"
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
