import { useAuth } from '@clerk/clerk-react';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import HarvousAuthForm from '../components/auth/HarvousAuthForm';
import { postAuthRedirectPath } from '../utils/post-auth-redirect';

export default function SignInPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const navigate = useNavigate();

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

  if (isSignedIn || (!isLoaded && /(?:^|;\s*)__client_uat=[1-9]/.test(document.cookie))) {
    return null;
  }

  return (
    <div id="sign-in-content" className="auth-page">
      <div className="auth-page__container">
        {/* Top floating Harvous pill — mirrors `/site/` Header.astro brand chip. */}
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

        {/* Centered display headline + custom Clerk-headless form. */}
        <div className="auth-page__form-section">
          <div className="auth-page__content-wrapper">
            <h1 className="auth-page__headline">
              Open <span className="auth-page__headline-mark">your</span> study Bible.
            </h1>
            <div className="auth-page__form-wrapper">
              <HarvousAuthForm mode="signIn" redirectRaw={redirectRaw} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
