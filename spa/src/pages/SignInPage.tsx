import { SignIn, useAuth } from '@clerk/clerk-react';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

export default function SignInPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const navigate = useNavigate();

  // Redirect if already signed in
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      const params = new URLSearchParams(window.location.search);
      const redirectUrl = params.get('redirect_url') || '/dashboard';
      navigate({ to: redirectUrl });
    }
  }, [isLoaded, isSignedIn, navigate]);

  const params = new URLSearchParams(window.location.search);
  const redirectUrl = params.get('redirect_url') ?? '/dashboard';

  return (
    <div id="sign-in-content" className="auth-page">
      <div className="auth-page__container">
        {/* Left column (desktop) / Top row (mobile): Animated mesh gradient */}
        <div className="auth-page__video-section thread-colors-mesh-gradient">
          <div className="auth-page__video-overlay" style={{ padding: '24px' }}>
            <a href="https://harvous.com" className="auth-page__logo-container">
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
              routing="path"
              path="/sign-in"
              signUpUrl={
                redirectUrl !== '/dashboard'
                  ? `/sign-up?redirect_url=${encodeURIComponent(redirectUrl)}`
                  : '/sign-up'
              }
              fallbackRedirectUrl={redirectUrl}
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
                  formFieldLabel: 'hidden',
                  formFieldError: { className: 'clerk-form-error' },
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
                  footerActionLink: 'clerk-form-link',
                  dividerLine: 'clerk-form-divider-line',
                  dividerText: 'clerk-form-divider-text',
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
