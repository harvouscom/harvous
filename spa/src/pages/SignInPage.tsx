import { SignIn, useAuth } from '@clerk/clerk-react';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { postAuthClerkFallbackUrl, postAuthRedirectPath } from '../utils/post-auth-redirect';

export default function SignInPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const navigate = useNavigate();

  // Redirect if already signed in
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get('redirect_url');
      const path = postAuthRedirectPath(raw);
      navigate({ to: path as any });
    }
  }, [isLoaded, isSignedIn, navigate]);

  // Patch subtitle text after Clerk renders (Clerk CDN text varies by environment)
  useEffect(() => {
    const target = "Enter your email and we'll get you signed in.";
    const patch = () => {
      const el = document.querySelector('.cl-headerSubtitle');
      if (el && el.textContent !== target) el.textContent = target;
    };
    const observer = new MutationObserver(patch);
    observer.observe(document.body, { childList: true, subtree: true });
    patch();
    return () => observer.disconnect();
  }, []);

  const params = new URLSearchParams(window.location.search);
  const redirectRaw = params.get('redirect_url');
  const hasCustomRedirect = redirectRaw != null && redirectRaw !== '';
  const redirectPath = postAuthRedirectPath(redirectRaw);
  const clerkFallbackUrl = postAuthClerkFallbackUrl(redirectPath);

  if (isSignedIn || (!isLoaded && /(?:^|;\s*)__client_uat=[1-9]/.test(document.cookie))) {
    return null;
  }

  return (
    <div id="sign-in-content" className="auth-page">
      <div className="auth-page__container">
        {/* Left column (desktop) / Top row (mobile): Animated mesh gradient */}
        <div className="auth-page__video-section thread-colors-mesh-gradient">
          <div className="auth-page__video-overlay" style={{ padding: '24px' }}>
            <a href="https://app.harvous.com" className="auth-page__logo-container">
              <svg
                width="28"
                height="40"
                viewBox="0 0 45 64"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="auth-page__logo sign-in-logo"
                aria-label="Harvous"
              >
                <path
                  d="M44.8037 63.9941H0.0078125V0H44.8037V63.9941ZM34.5645 31.168C25.6988 34.2637 18.5024 41.2949 15.3711 50.543L14.2842 53.752H34.5645V31.168ZM10.2471 37.8643C15.8921 29.2487 24.5827 23.0353 34.5645 20.4824V10.2393H10.2471V37.8643Z"
                  fill="#fff"
                />
              </svg>
            </a>
          </div>
        </div>

        {/* Right column (desktop) / Bottom row (mobile): Clerk sign-in form */}
        <div className="auth-page__form-section">
          <div className="auth-page__form-wrapper">
            <SignIn
              routing="hash"
              signUpUrl={
                hasCustomRedirect
                  ? `/sign-up?redirect_url=${encodeURIComponent(redirectRaw!)}`
                  : '/sign-up'
              }
              fallbackRedirectUrl={clerkFallbackUrl}
              appearance={{
                elements: {
                  rootBox: 'clerk-form-root',
                  card: {
                    className: 'clerk-form-card',
                    style: { border: 'none', borderWidth: '0', overflowX: 'hidden' },
                  },
                  headerTitle: 'clerk-form-header-title',
                  headerSubtitle: 'clerk-form-header-subtitle',
                  formButtonPrimary: 'clerk-form-button-primary primary-button',
                  formFieldInput: 'clerk-form-input',
                  formFieldLabel: {
                    className: 'hidden',
                    style: { display: 'none' },
                  },
                  formFieldErrorText: { className: 'clerk-form-error' },
                  formFieldAlert: {
                    className: 'clerk-form-alert',
                    style: {
                      maxWidth: '100%',
                      width: '100%',
                      boxSizing: 'border-box',
                      overflowWrap: 'break-word',
                      wordWrap: 'break-word',
                      whiteSpace: 'normal',
                    },
                  },
                  formFieldWarningText: {
                    className: 'clerk-form-alert',
                    style: {
                      maxWidth: '100%',
                      width: '100%',
                      boxSizing: 'border-box',
                      overflowWrap: 'break-word',
                      wordWrap: 'break-word',
                      whiteSpace: 'normal',
                    },
                  },
                  alert: {
                    className: 'clerk-form-alert clerk-form-banner-alert',
                    style: {
                      maxWidth: '100%',
                      width: '100%',
                      boxSizing: 'border-box',
                      flexWrap: 'wrap',
                      alignItems: 'flex-start',
                    },
                  },
                  alertText: {
                    className: 'clerk-form-alert',
                    style: {
                      maxWidth: '100%',
                      boxSizing: 'border-box',
                      overflowWrap: 'break-word',
                      whiteSpace: 'normal',
                    },
                  },
                  alertTextContainer: {
                    className: 'clerk-form-alert-text-container',
                    style: {
                      flex: '1 1 0',
                      minWidth: 0,
                      maxWidth: '100%',
                      boxSizing: 'border-box',
                      overflowWrap: 'break-word',
                      whiteSpace: 'normal',
                    },
                  },
                  'alert__warning': {
                    className: 'clerk-form-alert clerk-form-banner-alert',
                    style: {
                      maxWidth: '100%',
                      width: '100%',
                      boxSizing: 'border-box',
                      flexWrap: 'wrap',
                      alignItems: 'flex-start',
                    },
                  },
                  'alertText__warning': {
                    className: 'clerk-form-alert',
                    style: {
                      maxWidth: '100%',
                      boxSizing: 'border-box',
                      overflowWrap: 'break-word',
                      whiteSpace: 'normal',
                    },
                  },
                  'alertTextContainer__warning': {
                    className: 'clerk-form-alert-text-container',
                    style: {
                      flex: '1 1 0',
                      minWidth: 0,
                      maxWidth: '100%',
                      boxSizing: 'border-box',
                      overflowWrap: 'break-word',
                      whiteSpace: 'normal',
                    },
                  },
                  main: { style: { gap: '12px' } },
                  form: { style: { gap: '12px' } },
                  formContainer: { style: { gap: '12px' } },
                  formFieldRow: { style: { marginBottom: 0, marginTop: 0 } },
                  formField: { style: { marginBottom: 0, marginTop: 0 } },
                  footerActionLink: 'clerk-form-link',
                  dividerLine: 'clerk-form-divider-line',
                  dividerText: 'clerk-form-divider-text',
                  buttonArrowIcon: 'hidden',
                },
                variables: {
                  colorPrimary: 'var(--color-bold-blue)',
                },
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
